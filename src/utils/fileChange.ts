// ============================================================
// ai-chat-ui · 文件改动（file change）解析
//
// 对话里最要紧的一件事是「它到底改了哪些文件」。工具调用本身只有一坨参数 JSON，
// 用户在气泡里看不到任何结果 —— 这个文件把各家 agent 的「写文件 / 改文件」调用
// 收敛成一个规范形状（FileChange），组件只认这个形状。
//
// 只靠参数就能算出来，所以**实时流式**和**历史回放**是同一套口径：宿主管线里
// 不需要为它额外存字段，也不用再读一遍磁盘。
// ============================================================

import type { FileChange, ToolCall } from '@/types'

/** 折叠态展示的单行 patch 上限：再长就没人看了，展开也是滚 */
const MAX_PATCH_LINES = 400
/** 整文件写入时预览的行数上限（那不是 diff，只是「写了什么」的抽样） */
const MAX_WRITE_PREVIEW_LINES = 80
/** LCS 的规模上限：超过就不逐行比了，直接全删全增（结果仍可读，只是不够精细） */
const MAX_DIFF_CELLS = 400000

/**
 * 归一化工具名：小写 + 去掉非字母数字。
 * `write_file` / `writeFile` / `write-file` 落到同一个键上。
 */
function normalizeToolName(name: string): string {
  return String(name || '').toLowerCase().replace(/[^a-z]/g, '')
}

/** 整文件写入类 */
const WRITE_TOOL_NAMES = new Set([
  'writefile',
  'createfile',
  'writetofile',
  'write',
  'create',
  'newfile'
])

/** 精确替换类 */
const EDIT_TOOL_NAMES = new Set([
  'editfile',
  'edit',
  'multiedit',
  'strreplace',
  'strreplaceeditor',
  'replaceinfile',
  'applyedit'
])

/** 这个工具名是不是「会改动文件」的那一类 */
export function isFileChangeTool(name: string | undefined | null): boolean {
  const key = normalizeToolName(String(name || ''))
  return WRITE_TOOL_NAMES.has(key) || EDIT_TOOL_NAMES.has(key)
}

function pickString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string') return value
  }
  return undefined
}

function parseArgs(toolCall: ToolCall): Record<string, unknown> | null {
  const raw = toolCall.arguments
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** 一行一行地拆。CRLF 归一，末尾空行不算一行（否则每次都要多算一个 +1） */
function toLines(text: string): string[] {
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n')
  if (!normalized) return []
  const lines = normalized.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

export function countLines(text: string): number {
  return toLines(text).length
}

type DiffOp = { type: ' ' | '-' | '+'; text: string }

/**
 * 逐行 LCS。规模过大时退化成「全删 + 全增」—— 计数仍然对（旧行数 / 新行数），
 * 只是看不出行内挪动，比在浏览器里卡死强。
 */
function diffOps(a: string[], b: string[]): DiffOp[] {
  const n = a.length
  const m = b.length
  if (n === 0) return b.map(text => ({ type: '+' as const, text }))
  if (m === 0) return a.map(text => ({ type: '-' as const, text }))
  if (n * m > MAX_DIFF_CELLS) {
    return [
      ...a.map(text => ({ type: '-' as const, text })),
      ...b.map(text => ({ type: '+' as const, text }))
    ]
  }
  // dp[i][j] = a[i..] 与 b[j..] 的 LCS 长度
  const width = m + 1
  const dp = new Uint32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * width + j] = a[i] === b[j]
        ? dp[(i + 1) * width + j + 1] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1])
    }
  }
  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: ' ', text: a[i] })
      i += 1
      j += 1
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      ops.push({ type: '-', text: a[i] })
      i += 1
    } else {
      ops.push({ type: '+', text: b[j] })
      j += 1
    }
  }
  while (i < n) {
    ops.push({ type: '-', text: a[i] })
    i += 1
  }
  while (j < m) {
    ops.push({ type: '+', text: b[j] })
    j += 1
  }
  return ops
}

/**
 * 生成 unified patch（见 `patch` 字段）。只保留改动附近 `context` 行，
 * 中间隔得远的两处改动拆成两个 hunk。
 */
function buildPatch(ops: DiffOp[], context = 3): string {
  const positions = ops.map((op, index) => ({ ...op, index }))
  const changed = positions.filter(op => op.type !== ' ')
  if (changed.length === 0) return ''

  // 每个 op 落在旧/新文件的第几行，用来写 hunk 头
  let aLine = 1
  let bLine = 1
  const withPos = positions.map(op => {
    const pos = { ...op, aLine, bLine }
    if (op.type !== '+') aLine += 1
    if (op.type !== '-') bLine += 1
    return pos
  })

  // 改动簇：相邻改动之间夹着的上下文不超过 2*context 就并进同一个 hunk
  const clusters: Array<[number, number]> = []
  for (const op of changed) {
    const last = clusters[clusters.length - 1]
    if (last && op.index - last[1] <= context * 2) last[1] = op.index
    else clusters.push([op.index, op.index])
  }

  const out: string[] = []
  for (const [start, end] of clusters) {
    const from = Math.max(0, start - context)
    const to = Math.min(withPos.length - 1, end + context)
    const slice = withPos.slice(from, to + 1)
    const aStart = slice[0].aLine
    const bStart = slice[0].bLine
    const aCount = slice.filter(op => op.type !== '+').length
    const bCount = slice.filter(op => op.type !== '-').length
    out.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`)
    for (const op of slice) out.push(`${op.type}${op.text}`)
  }

  if (out.length > MAX_PATCH_LINES) {
    out.length = MAX_PATCH_LINES
    out.push('…（其余改动已省略）')
  }
  return out.join('\n')
}

/** 从一段 old/new 文本算出计数与 patch */
function diffTexts(oldText: string, newText: string): { added: number; removed: number; patch: string } {
  const ops = diffOps(toLines(oldText), toLines(newText))
  let added = 0
  let removed = 0
  for (const op of ops) {
    if (op.type === '+') added += 1
    else if (op.type === '-') removed += 1
  }
  return { added, removed, patch: buildPatch(ops) }
}

/** 一条「改文件」的工具调用解析出来的东西 */
export interface ParsedFileChange extends FileChange {
  /** 工具名（排错用；组件不展示） */
  tool?: string
}

/**
 * 解析结果缓存：键是工具调用对象，值是「参数原文 → 结果」。
 * 流式期间每 push 一条新调用都会把整条消息的调用重算一遍，而 write_file 的
 * arguments 可能是几百 KB 的文件内容 —— 同一个字符串没必要反复 JSON.parse。
 */
const parseCache = new WeakMap<ToolCall, { args: string; value: ParsedFileChange | null }>()

/**
 * 从一条工具调用里读出「改了哪个文件、加了几行、删了几行」。
 * 不是写文件类工具、参数解析不出来、或拿不到路径 → null。
 */
export function readFileChange(toolCall: ToolCall | undefined | null): ParsedFileChange | null {
  if (!toolCall) return null
  // 宿主如果已经算好了（例如服务端读了真实前后文），优先用它
  if (toolCall.fileChange) return { ...toolCall.fileChange }

  const raw = toolCall.arguments || ''
  const cached = parseCache.get(toolCall)
  if (cached && cached.args === raw) return cached.value

  const value = parseFileChange(toolCall)
  parseCache.set(toolCall, { args: raw, value })
  return value
}

function parseFileChange(toolCall: ToolCall): ParsedFileChange | null {
  if (!isFileChangeTool(toolCall.name)) return null
  const args = parseArgs(toolCall)
  if (!args) return null

  const path = pickString(args, ['path', 'file_path', 'filePath', 'target_file', 'filename', 'file'])
  if (!path) return null

  const command = pickString(args, ['command', 'action'])
  // str_replace_editor 一套工具走命令分发：view 是读，不是改
  if (command && ['view', 'read', 'open'].includes(command.toLowerCase())) return null

  const name = normalizeToolName(toolCall.name)
  const isWrite = WRITE_TOOL_NAMES.has(name)
    || (command ? ['create', 'write', 'append'].includes(command.toLowerCase()) : false)

  if (isWrite) {
    const content = pickString(args, ['content', 'file_text', 'fileText', 'text', 'new_content', 'newContent'])
    if (content === undefined) return null
    const lines = toLines(content)
    const preview = lines.slice(0, MAX_WRITE_PREVIEW_LINES).map(line => `+${line}`)
    if (lines.length > MAX_WRITE_PREVIEW_LINES) preview.push('…（文件其余部分已省略）')
    return {
      path,
      kind: 'write',
      added: lines.length,
      patch: preview.join('\n'),
      tool: toolCall.name
    }
  }

  // 精确替换：一条调用里可能有多处（MultiEdit 的 edits[]）
  const edits: Array<{ oldText: string; newText: string }> = []
  const single = {
    oldText: pickString(args, ['old_string', 'old_str', 'oldText', 'old_text', 'old', 'search', 'find']),
    newText: pickString(args, ['new_string', 'new_str', 'newText', 'new_text', 'new', 'replace', 'replace_with'])
  }
  if (single.oldText !== undefined && single.newText !== undefined) {
    edits.push({ oldText: single.oldText, newText: single.newText })
  }
  if (Array.isArray(args.edits)) {
    for (const item of args.edits) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const oldText = pickString(row, ['old_string', 'old_str', 'oldText', 'old_text', 'old', 'search', 'find'])
      const newText = pickString(row, ['new_string', 'new_str', 'newText', 'new_text', 'new', 'replace', 'replace_with'])
      if (oldText !== undefined && newText !== undefined) edits.push({ oldText, newText })
    }
  }
  if (edits.length === 0) return null

  let added = 0
  let removed = 0
  const patches: string[] = []
  for (const edit of edits) {
    const delta = diffTexts(edit.oldText, edit.newText)
    added += delta.added
    removed += delta.removed
    if (delta.patch) patches.push(delta.patch)
  }

  return {
    path,
    kind: 'edit',
    added,
    removed,
    patch: patches.join('\n'),
    tool: toolCall.name
  }
}

/**
 * 一条消息里的所有改动，按文件合并：同一文件被改多次 → 计数相加、patch 拼接。
 * 顺序按首次出现的先后（和发生顺序一致，用户读起来才对得上）。
 */
export function collectFileChanges(toolCalls: ToolCall[] | undefined | null): FileChange[] {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return []
  const merged = new Map<string, FileChange>()
  for (const toolCall of toolCalls) {
    const change = readFileChange(toolCall)
    if (!change) continue
    const key = change.path.replace(/\\/g, '/')
    const prev = merged.get(key)
    if (!prev) {
      merged.set(key, {
        path: change.path,
        kind: change.kind,
        added: change.added,
        removed: change.removed,
        patch: change.patch
      })
      continue
    }
    prev.added = (prev.added || 0) + (change.added || 0)
    prev.removed = (prev.removed || 0) + (change.removed || 0)
    if (change.kind === 'create') prev.kind = 'create'
    if (change.patch) prev.patch = prev.patch ? `${prev.patch}\n${change.patch}` : change.patch
  }
  return Array.from(merged.values())
}
