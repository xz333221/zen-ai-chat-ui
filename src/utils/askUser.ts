// ============================================================
// ai-chat-ui · 提问（ask_user）解析
//
// ask_user 这类工具调用把「问了什么」放在 arguments 里、把「答了什么」放在 result 里：
//   arguments → { question, options, allow_free_text, multiple }
//   result    → 单选是答案原样字符串；多选是 JSON 数组字符串（见服务端 submitAgentAnswer）
// 组件要把这一对还原成 AskUserPanel 的只读留档态，就得先把它们收敛成规范形状。
// 这个文件只做解析，不碰渲染。
// ============================================================

import type { ToolCall } from '@/types'

/** 归一化后的提问记录（只读留档态要的那几项） */
export interface AskUserRecord {
  /** 问题正文 */
  question: string
  /** 选项；为空表示当时只能自由输入 */
  options: string[]
  /** 当时是否多选 */
  multiple: boolean
  /** 当时是否允许自由输入 */
  allowFreeText: boolean
  /** 用户提交的答案（多选为多项） */
  answers: string[]
}

/** 选项数上限：模型跑偏给一长串时截掉，别把气泡撑爆 */
const MAX_OPTIONS = 20
/** 单条答案上限（字符）：自由输入可能是一整段话 */
const MAX_ANSWER = 500

/** 归一化后的提问类工具名 */
const ASK_USER_NAMES = new Set(['askuser', 'askquestion', 'asktheuser'])

function normalizeToolName(name: string): string {
  return String(name || '').toLowerCase().replace(/[^a-z]/g, '')
}

/** 这个工具名是不是「向用户提问」。宿主也可以拿它筛自己的调用列表 */
export function isAskUserTool(name: string | undefined | null): boolean {
  return ASK_USER_NAMES.has(normalizeToolName(String(name || '')))
}

/** arguments（JSON 字符串）→ 问题与选项；解析不出问题正文就返回 null */
export function parseAskUserArgs(args: string | undefined | null): Omit<AskUserRecord, 'answers'> | null {
  if (!args) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(String(args))
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const question = String(raw.question ?? raw.prompt ?? '').trim()
  if (!question) return null

  const options = Array.isArray(raw.options)
    ? raw.options.map((o) => String(o ?? '').trim()).filter(Boolean).slice(0, MAX_OPTIONS)
    : []
  return {
    question,
    options,
    // 与工具侧同口径（见 toolAskUser）：没有选项时恒为 true，否则无内容可答
    allowFreeText: options.length === 0 || raw.allow_free_text !== false,
    // 多选只在真的给了选项时才有意义
    multiple: raw.multiple === true && options.length > 0
  }
}

/**
 * result → 答案数组。
 *
 * 多选回给模型的是 JSON 数组字符串，单选与自由输入是原样字符串 —— 所以先试 JSON，
 * 不是数组就整串当成一个答案（**别把 `["a"]` 这种当异常丢掉**：用户完全可能
 * 自由输入一段以 `[` 开头的话，那种情况下面会原样保留）。
 */
export function parseAskUserAnswers(result: string | undefined | null): string[] {
  const raw = String(result ?? '').trim()
  if (!raw) return []
  if (raw.startsWith('[')) {
    try {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        return arr.map((a) => String(a ?? '').trim()).filter(Boolean).slice(0, MAX_OPTIONS)
      }
    } catch {
      /* 不是 JSON —— 当成一句普通答案往下走 */
    }
  }
  return [raw.length > MAX_ANSWER ? `${raw.slice(0, MAX_ANSWER)}…` : raw]
}

/**
 * 这条调用能不能渲染成「问答留档」；不能就返回 null（调用方退回普通工具行）。
 *
 * 三个条件缺一不可：是提问类工具、已经结束（还在等回答时面板由宿主摆着，
 * 这里再画一个就成了两个），且真的拿到了答案。
 */
export function readAskUser(toolCall?: ToolCall | null): AskUserRecord | null {
  if (!toolCall || !isAskUserTool(toolCall.name)) return null
  if (toolCall.status && toolCall.status !== 'done') return null
  const args = parseAskUserArgs(toolCall.arguments)
  if (!args) return null
  const answers = parseAskUserAnswers(toolCall.result)
  if (!answers.length) return null
  return { ...args, answers }
}
