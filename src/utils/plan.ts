// ============================================================
// ai-chat-ui · 计划（plan）解析
//
// 计划类工具（update_plan / TodoWrite …）的参数本质是「一串带状态的步骤」。
// 各家 agent 的字段名不一样：update_plan 用 steps/content，Claude Code 的
// TodoWrite 用 todos/activeForm，还有人直接把数组当参数。
// 这个文件把那些差异收敛成一个规范形状（PlanStep[]），组件只认规范形状。
// ============================================================

import type { PlanStep, PlanStepStatus, ToolCall } from '@/types'

/** 步数上限：超过就是模型跑偏了，截掉比撑爆气泡好 */
export const MAX_PLAN_STEPS = 20

/** 单步文案上限（字符） */
const MAX_STEP_CONTENT = 200

/** 单步说明上限（字符） */
const MAX_STEP_NOTE = 300

/** 计划说明上限（字符） */
const MAX_PLAN_NOTE = 600

/**
 * 归一化后的计划类工具名。
 *
 * 归一化 = 小写 + 去掉非字母数字，于是 `update_plan` / `updatePlan` /
 * `update-plan` 落到同一个键上。
 */
const PLAN_TOOL_NAMES = new Set([
  'updateplan',
  'writetodos',
  'todowrite',
  'todotrite',
  'todorewrite',
  'updateplanlist',
  'createplan',
  'setplan',
  'plan'
])

function normalizeToolName(name: string): string {
  return String(name || '').toLowerCase().replace(/[^a-z]/g, '')
}

/**
 * 这个工具名是不是「计划类」。
 *
 * 宿主可以直接拿它筛出计划调用，组件内部也用它决定要不要走计划渲染。
 */
export function isPlanTool(name: string | undefined | null): boolean {
  return PLAN_TOOL_NAMES.has(normalizeToolName(String(name || '')))
}

/** 各家状态词 → 规范三态。归一化去掉分隔符，`in_progress` / `inProgress` / `in-progress` 同义 */
function normalizeStatus(raw: unknown): PlanStepStatus {
  const s = String(raw ?? '').toLowerCase().replace(/[^a-z]/g, '')
  if (['completed', 'complete', 'done', 'finished', 'checked'].includes(s)) return 'completed'
  if (['inprogress', 'active', 'doing', 'running', 'current', 'started'].includes(s)) return 'in_progress'
  return 'pending'
}

function clampText(text: unknown, max: number): string {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max) + '…' : s
}

function parseStep(raw: unknown): PlanStep | null {
  // 兼容字符串步骤：'读 README'
  if (typeof raw === 'string') {
    const content = clampText(raw, MAX_STEP_CONTENT)
    return content ? { content, status: 'pending' } : null
  }
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const content = clampText(
    item.content ?? item.text ?? item.title ?? item.task ?? item.step ?? item.name,
    MAX_STEP_CONTENT
  )
  if (!content) return null
  const step: PlanStep = { content, status: normalizeStatus(item.status ?? item.state) }
  // activeForm 是 TodoWrite 的「正在做什么」的现在时描述，只在它是进行中时才有意义
  const noteRaw = item.note ?? item.detail ?? item.details ?? (step.status === 'in_progress' ? item.activeForm : '')
  const note = clampText(noteRaw, MAX_STEP_NOTE)
  if (note) step.note = note
  return step
}

/** 从任意形状的参数对象里挖出步骤数组（steps / todos / plan / items / 数组本身） */
function pickSteps(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  for (const key of ['steps', 'todos', 'plan', 'items', 'task_list', 'taskList']) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[]
  }
  return null
}

/** 挖出计划说明（explanation / summary / note） */
function pickNote(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const obj = parsed as Record<string, unknown>
  const note = clampText(obj.explanation ?? obj.summary ?? obj.note ?? obj.reason, MAX_PLAN_NOTE)
  return note || undefined
}

/**
 * 解析计划类工具的参数 → 规范步骤。
 *
 * @param source 工具调用对象（优先用它的 `plan` 字段，没有再解析 `arguments`），
 *               或直接给参数 JSON 字符串 / 已解析的对象
 * @param name   单独给工具名时（第一个参数是参数时必给），用于决定是否按计划解析
 * @returns 解析不出步骤时返回 null（调用方据此回退到普通工具块）
 */
export function parsePlanArgs(
  source: string | ToolCall | Record<string, unknown> | null | undefined,
  name?: string
): PlanStep[] | null {
  if (!source) return null

  // ① 直接给 ToolCall：已挂 plan 就用，没挂再按工具名 + arguments 解析
  if (typeof source === 'object' && !Array.isArray(source) && ('name' in source || 'arguments' in source || 'plan' in source)) {
    const call = source as ToolCall
    const toolName = call.name ?? name ?? ''
    // 不是计划类工具就直接放弃：别把 read_file 的参数也硬凑成清单
    if (toolName && !isPlanTool(toolName) && !call.plan) return null
    if (Array.isArray(call.plan) && call.plan.length) {
      return call.plan
        .map((s) => parseStep(s))
        .filter((s): s is PlanStep => Boolean(s))
        .slice(0, MAX_PLAN_STEPS)
    }
    return parsePlanArgs(call.arguments, toolName)
  }

  // ② 原始字符串：先按工具名筛，再 JSON.parse
  if (typeof source === 'string') {
    if (name && !isPlanTool(name)) return null
    const raw = source.trim()
    if (!raw) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
    const list = pickSteps(parsed)
    if (!list) return null
    const steps = list
      .map(parseStep)
      .filter((s): s is PlanStep => Boolean(s))
      .slice(0, MAX_PLAN_STEPS)
    return steps.length ? steps : null
  }

  // ③ 已是对象
  if (name && !isPlanTool(name)) return null
  const list = pickSteps(source)
  if (!list) return null
  const steps = list
    .map(parseStep)
    .filter((s): s is PlanStep => Boolean(s))
    .slice(0, MAX_PLAN_STEPS)
  return steps.length ? steps : null
}

/**
 * 计划说明：从 ToolCall 挂的 `planNote`，或从参数里挖。
 */
export function parsePlanNote(source: string | ToolCall | null | undefined): string | undefined {
  if (!source) return undefined
  if (typeof source === 'object') {
    if (source.planNote) return source.planNote
    return parsePlanNote(source.arguments)
  }
  const raw = source.trim()
  if (!raw) return undefined
  try {
    return pickNote(JSON.parse(raw))
  } catch {
    return undefined
  }
}

/** 一步计划 + 一句说明（说明可能不存在） */
export interface ParsedPlan {
  steps: PlanStep[]
  note?: string
}

/**
 * 一步到位的解析：给工具调用，拿到「步骤 + 说明」。
 * 组件和宿主都用它，保证两边判的是同一件事。
 */
export function readPlan(call: ToolCall | null | undefined): ParsedPlan | null {
  if (!call) return null
  const steps = parsePlanArgs(call)
  if (!steps) return null
  const note = parsePlanNote(call)
  return note ? { steps, note } : { steps }
}

/** 计划进度统计：已完成 / 进行中 / 待办 / 总数 */
export function planProgress(steps: PlanStep[] | null | undefined): {
  total: number
  done: number
  active: number
  pending: number
} {
  const list = steps || []
  let done = 0
  let active = 0
  let pending = 0
  for (const s of list) {
    if (s.status === 'completed') done++
    else if (s.status === 'in_progress') active++
    else pending++
  }
  return { total: list.length, done, active, pending }
}
