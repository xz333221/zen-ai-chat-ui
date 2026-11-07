// ============================================================
// ai-chat-ui · unified diff 解析
//
// `FileChange.patch` 是「`@@` 头 + 前缀行」的纯文本（见 utils/fileChange）。
// 要在抽屉里把它画成带行号、带增删底色、带语法高亮的代码，得先拆成行。
//
// 这里只做**纯文本 → 行模型**，不碰 DOM、不碰 shiki，宿主拿到也能自己复用。
// ============================================================

/** 一行的类型：增 / 删 / 上下文 / hunk 头 / 说明 */
export type DiffRowType = 'add' | 'del' | 'context' | 'hunk' | 'note'

export interface DiffRow {
  type: DiffRowType
  /** 去掉 diff 前缀之后的代码内容（hunk / note 行是原文） */
  text: string
  /** 行首符号：`+` / `-` / 空格；hunk 与 note 为空 */
  sign: string
  /** 旧文件行号；新增行与 hunk / note 为 null */
  oldNo: number | null
  /** 新文件行号；删除行与 hunk / note 为 null */
  newNo: number | null
}

/** `@@ -12,3 +12,5 @@ 可选的函数名` */
const HUNK_RE = /^@@+ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/** git 会给的元信息行，抽屉里没必要展示（路径在标题里已经有了） */
const META_RE =
  /^(?:diff --git |index |--- |\+\+\+ |new file mode |deleted file mode |old mode |new mode |similarity index |dissimilarity index |rename from |rename to )/

const NOTE_RE = /^\\ No newline at end of file$/

function row(type: DiffRowType, text: string, sign: string, oldNo: number | null, newNo: number | null): DiffRow {
  return { type, text, sign, oldNo, newNo }
}

/**
 * 把 unified diff 拆成可渲染的行。
 *
 * 没有前缀的行有两种来源：整文件写入时那条「其余部分已省略」的说明，
 * 以及少数 agent 直接给裸文本。前者当 note（灰字、无行号），
 * 若已经处在 hunk 里则按上下文行处理（行号照常推进）。
 */
export function parseUnifiedDiff(patch: string | undefined | null): DiffRow[] {
  const source = String(patch ?? '').replace(/\r\n?/g, '\n')
  if (!source.trim()) return []

  const rows: DiffRow[] = []
  // 整文件写入的 patch 没有 `@@` 头（只有一串 `+`），从 1 开始数才对得上文件
  let oldNo = 1
  let newNo = 1
  let inHunk = false

  const lines = source.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]
    // patch 末尾的换行会多切出一行空串，跳过它
    if (index === lines.length - 1 && raw === '') break

    const hunk = HUNK_RE.exec(raw)
    if (hunk) {
      oldNo = Number(hunk[1])
      newNo = Number(hunk[2])
      inHunk = true
      rows.push(row('hunk', raw, '', null, null))
      continue
    }

    if (META_RE.test(raw) || NOTE_RE.test(raw)) continue

    const sign = raw.charAt(0)
    if (sign === '+') {
      rows.push(row('add', raw.slice(1), '+', null, newNo))
      newNo += 1
      continue
    }
    if (sign === '-') {
      rows.push(row('del', raw.slice(1), '-', oldNo, null))
      oldNo += 1
      continue
    }
    if (sign === ' ') {
      rows.push(row('context', raw.slice(1), ' ', oldNo, newNo))
      oldNo += 1
      newNo += 1
      continue
    }

    if (inHunk) {
      rows.push(row('context', raw, ' ', oldNo, newNo))
      oldNo += 1
      newNo += 1
    } else {
      rows.push(row('note', raw, '', null, null))
    }
  }
  return rows
}

/** 只有这三种行是「代码」，参与语法高亮；行号列也只在它们上面有值 */
export function isCodeRow(type: DiffRowType): boolean {
  return type === 'add' || type === 'del' || type === 'context'
}

/** 扩展名 → shiki 语言 id。认不出就返回 null（退化成纯文本，不报错） */
const EXT_LANG: Record<string, string> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  vue: 'vue',
  svelte: 'svelte',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  scala: 'scala',
  lua: 'lua',
  dart: 'dart',
  json: 'json',
  jsonc: 'jsonc',
  json5: 'json5',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  conf: 'ini',
  env: 'dotenv',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  styl: 'stylus',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'mdx',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',
  ps1: 'powershell',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  prisma: 'prisma',
  proto: 'proto',
  tex: 'latex',
  txt: 'text',
  log: 'text'
}

/** 没有扩展名但能认出来的文件名 */
const NAME_LANG: Record<string, string> = {
  dockerfile: 'docker',
  makefile: 'makefile',
  gemfile: 'ruby',
  rakefile: 'ruby',
  'cmakelists.txt': 'cmake',
  '.gitignore': 'ini',
  '.npmrc': 'ini',
  '.editorconfig': 'ini'
}

/** 按文件路径猜 shiki 语言；猜不出返回 null */
export function diffLanguage(path: string | undefined | null): string | null {
  const name = String(path ?? '').replace(/\\/g, '/').split('/').pop() ?? ''
  if (!name) return null
  const lower = name.toLowerCase()
  if (NAME_LANG[lower]) return NAME_LANG[lower]
  const dot = lower.lastIndexOf('.')
  if (dot <= 0) return null
  return EXT_LANG[lower.slice(dot + 1)] ?? null
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

/** 高亮结果要拼进 v-html，内容必须先转义 */
export function escapeHtml(text: string): string {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch)
}

/**
 * 拆成「目录 / 文件名」两段，便于目录压灰、文件名做主色。
 * 统一成正斜杠：Windows 路径直接显示反斜杠在列表里很扎眼。
 */
export function splitFilePath(path: string | undefined | null): { dir: string; base: string } {
  const normalized = String(path ?? '').replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  if (index < 0) return { dir: '', base: normalized }
  return { dir: normalized.slice(0, index + 1), base: normalized.slice(index + 1) }
}
