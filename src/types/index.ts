// ============================================================
// ai-chat-ui · 核心类型定义
// 对消费方公开，便于在业务侧构造消息、预设问题等数据
// ============================================================

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system'

/** 消息状态 */
export type MessageStatus = 'pending' | 'streaming' | 'done' | 'error'

/** 思考（reasoning）内容状态 */
export type ReasoningStatus = 'streaming' | 'done' | undefined

/** 附件类型 */
export interface ChatAttachment {
  /** 唯一 id */
  id: string
  /** 文件名 */
  name: string
  /** 文件大小（字节） */
  size: number
  /** MIME 类型 */
  type: string
  /** 可访问 URL（如已上传） */
  url?: string
  /** 图片缩略图 dataURL / URL */
  preview?: string
}

/** 工具调用状态 */
export type ToolCallStatus = 'pending' | 'running' | 'done' | 'error'

/** 计划步骤状态 */
export type PlanStepStatus = 'pending' | 'in_progress' | 'completed'

/**
 * 计划里的一个步骤。
 *
 * 字段名刻意用最短的 `content` / `status`——它同时也是 `parsePlanArgs()`
 * 的归一化产物，宿主解析出来的和模型直接给的用同一套类型。
 */
export interface PlanStep {
  /** 步骤文案 */
  content: string
  /** 步骤状态，缺省视为 `pending` */
  status?: PlanStepStatus
  /** 补充说明（可选，显示在步骤下方） */
  note?: string
}

/** 计划块上可覆盖的文案（宿主要走 i18n 时传自己的翻译） */
export interface PlanLabels {
  /** 标题，默认「计划」 */
  title?: string
  /** 进度文案模板，`{done}` / `{total}` 会被替换；默认「{done}/{total}」 */
  progress?: string
  /** 展开查看原始参数的按钮文案，默认「原始参数」 */
  raw?: string
}

/**
 * 计划块展示配置。
 */
export interface PlanConfig {
  /** 标题；不传则用 `labels.title` → 默认「计划」 */
  title?: string
  /**
   * 是否展示标题右侧的进度（`2/5`）。
   * @default true
   */
  progress?: boolean
  /**
   * 是否展示标题下方的细进度条。
   * @default true
   */
  progressBar?: boolean
  /**
   * 是否允许点标题行收起 / 展开步骤清单。
   *
   * 关掉时标题行退化成纯展示（不是 button），折叠能力整体消失。
   * @default true
   */
  collapsible?: boolean
  /**
   * 初始是否收起。
   * 收起后仍保留标题、`2/5` 进度和细进度条 —— 一行看完「还剩几步」，
   * 想看细节再点开。
   * @default false
   */
  defaultCollapsed?: boolean
  /** 文案覆盖 */
  labels?: PlanLabels
}

/** 单个工具调用 */
export interface ToolCall {
  /** 工具调用 id（对应 OpenAI tool_call_id） */
  id: string
  /** 工具名称 */
  name: string
  /** 参数预览（简短摘要字符串） */
  argsPreview?: string
  /** 完整参数（JSON 字符串） */
  arguments?: string
  /** 执行结果 */
  result?: string
  /** 执行状态 */
  status?: ToolCallStatus
  /** 错误信息 */
  error?: string
  /**
   * 计划步骤。
   *
   * 计划类工具（update_plan / TodoWrite …）会被渲染成带勾选态的清单，
   * 而不是一坨 JSON。不传时 `ToolCallBlock` 会自己从 `arguments` 解析
   * （见 `parsePlanArgs`），所以宿主只要把原始参数传进来即可。
   */
  plan?: PlanStep[]
  /** 计划说明（模型对这次计划调整给出的解释） */
  planNote?: string
}

/**
 * 工具调用展示配置。
 * 同一条 assistant 消息里可能有十几个连续的工具调用，
 * 默认折叠成一组、只展示最新（最后一次）的调用。
 */
export interface ToolCallsConfig {
  /**
   * 是否把多个工具调用折叠成组
   * @default true
   */
  group?: boolean
  /**
   * 调用数量达到该值时才折叠（最小生效值 2）
   * @default 2
   */
  collapseThreshold?: number
  /**
   * 折叠组默认是否展开
   * @default false
   */
  defaultExpanded?: boolean
}

/**
 * 思考（reasoning）块展示配置。
 *
 * 模型的思考过程有时极长（几千字），全量铺开会把气泡撑得非常高、
 * 把正文挤到屏幕外。默认给正文加高度上限，超出后内部滚动。
 */
export interface ThinkingConfig {
  /**
   * 正文超出高度上限时是否内部滚动
   * @default true
   */
  scrollable?: boolean
  /**
   * 正文最大高度（px）。仅在 scrollable 为 true 时生效
   * @default 320
   */
  maxHeight?: number
  /**
   * 流式输出过程中是否自动贴底跟随新内容。
   * 用户手动向上滚动后会暂停跟随，滚回底部则恢复
   * @default true
   */
  followStream?: boolean
  /**
   * 内部滚动条的显示时机。
   *
   * 思考是次要内容，一条常驻的灰条会一直把注意力从正文上拉走；
   * 但完全藏掉又让人不知道「下面还有」。
   *
   * - `'hover'`：静止时隐形，鼠标移入正文才淡入
   * - `'always'`：常显
   * - `'hidden'`：完全隐藏（滚动能力保留，滚轮 / 触控 / 键盘照常）
   * @default 'hover'
   */
  scrollbar?: 'hover' | 'always' | 'hidden'
  /**
   * 初始是否展开。不传则沿用默认行为（streaming 展开、完成折叠）
   */
  defaultExpanded?: boolean
  /**
   * 标题右侧是否显示思考段耗时（`4.2s`）。
   *
   * 只在拿得到耗时的时候显示：流式期间按开始时间实时跳动，结束后定格。
   * 拿不到（历史消息没存这个数、宿主也没给 `meta.reasoningMs`）就什么都不显示，
   * 不会出现「—」这种占位。
   * @default true
   */
  showDuration?: boolean
}

/**
 * 消息侧边条（MessageRail）配置。
 *
 * 贴在消息列表左边缘的一条竖直「刻度串」：**一轮问答 = 一根短横条**
 * （用户提问开启新的一轮，其后到下一个提问之前的消息都算这一轮），
 * 条数随对话轮次增长。悬停浮出「提问 + 回答摘要」，点击跳到该轮提问。
 * 用来在长篇对话里一眼看清结构并快速跳转，形态参考 Codex 侧边那组小横条。
 */
export interface MessageRailConfig {
  /**
   * 是否启用。默认关闭——它属于「锦上添花」的信息，
   * 会话不长时反而多一块视觉噪音，让接入方显式打开
   * @default false
   */
  enable?: boolean
  /**
   * 条的宽度按什么决定：
   *
   * - `'length'`：按**这一轮的正文总长度**，且**相对本会话归一**
   *   （最短的一轮贴 `minWidth`、最长的一轮贴 `maxWidth`，中间对数插值）。
   *   归一而不是用绝对刻度：真实对话一轮就是几十到几百字，绝对刻度会把这些
   *   轮次全压进同一小段宽度、看不出差别，归一后同样的数据能铺满整个区间。
   *   流式输出时最后一根会跟着长出来，自带进度感
   * - `'even'`：全部等宽（贴 `maxWidth`）。节奏整齐，适合只想看「聊了几轮」
   * @default 'length'
   */
  widthBy?: 'length' | 'even'
  /** 最短条宽（px） @default 8 */
  minWidth?: number
  /** 最长条宽（px） @default 26 */
  maxWidth?: number
  /** 条高（px） @default 3 */
  barHeight?: number
  /**
   * 条与条之间的最大间距（px）。
   * 消息很多时会自动压缩间距（下限 4px），仍放不下则在条组内部滚动
   * @default 10
   */
  maxGap?: number
  /** 条组最大高度（px），超出后条组内部滚动并自动把当前条带回视野 @default 320 */
  maxHeight?: number
  /** 静止态整体透明度；悬停或键盘聚焦时整组显形 @default 0.3 */
  idleOpacity?: number
  /** 悬停单根条时是否显示浮层（角色 + 内容摘要） @default true */
  showTooltip?: boolean
  /** 点击条是否滚动到对应消息 @default true */
  clickToScroll?: boolean
}

/**
 * token 用量。
 *
 * 只能由消费方从接口响应里取（各家字段名不同），组件库不做估算——
 * 估算出来的数字看着像真的，但会误导用户，比不显示更糟。
 */
export interface TokenUsage {
  /** 输入（prompt）tokens */
  prompt?: number
  /** 输出（completion）tokens */
  completion?: number
  /**
   * 总 tokens。不传时由 prompt + completion 推导，
   * 两者也没有则该项不展示
   */
  total?: number
  /** 思维链（reasoning）tokens，o1 / R1 类模型才有 */
  reasoning?: number
  /** 命中 prompt cache 的 tokens */
  cached?: number
}

/** 自定义元信息项，原样渲染在末尾 */
export interface MessageMetaExtra {
  /** 展示文案，例如「模型」 */
  label?: string
  /** 展示值，例如「MiniMax-M3」 */
  value: string
  /** 悬停提示 */
  title?: string
}

/**
 * 单条消息的运行元信息（耗时 / token 用量）。
 *
 * 耗时字段如果留空，`useStreaming().finish()` 会用内部时间戳自动回填，
 * 消费方一般只需要自己塞 `usage`。
 */
export interface MessageStats {
  /** 回答总耗时（毫秒） */
  durationMs?: number
  /** 首字延迟（毫秒）：从发起到第一个分片到达。流式体验的关键指标 */
  firstTokenMs?: number
  /**
   * 思考（reasoning）段耗时（毫秒）：第一个思考分片 → 最后一个思考分片。
   *
   * 不传时由 `reasoningStartedAt` / `reasoningEndedAt` 推导，两者也没有则不展示。
   * 手写流式（不走 `useStreaming()`）的宿主自己赋值即可，历史记录里也能显示。
   */
  reasoningMs?: number
  /** token 用量 */
  usage?: TokenUsage
  /** 附加自定义项（模型名、检索命中数…） */
  extra?: MessageMetaExtra[]
}

/** 元信息行里可展示的内置项 */
export type MessageMetaItem = 'duration' | 'firstToken' | 'tokens' | 'time'

/**
 * 消息元信息展示配置（气泡下方那行 `1.2s · ↑1,234 ↓5,678`）。
 */
export interface MessageMetaConfig {
  /**
   * 是否展示元信息行。
   *
   * 默认关闭：这是新增的可见元素，默认打开会让既有布局多出一行。
   * @default false
   */
  enable?: boolean
  /**
   * 要展示哪些项，按数组顺序渲染
   * @default ['duration', 'tokens']
   */
  items?: MessageMetaItem[]
  /**
   * 元信息与操作栏的排布
   * - `inline`：同一行，操作栏贴外侧、元信息贴内侧（紧凑）
   * - `below`：操作栏下面单独一行
   * @default 'inline'
   */
  position?: 'inline' | 'below'
  /**
   * 是否也展示 user 消息的元信息。
   * user 消息通常只有「时间」有意义
   * @default false
   */
  showForUser?: boolean
  /**
   * 元信息的显隐时机。
   *
   * - `'hover'`：与操作栏一致，鼠标悬停该条消息 / 键盘聚焦时才淡入。
   *   默认值——元信息和操作栏在同一行，两者一起出现比「一个常驻一个浮现」整齐
   * - `'always'`：常显。适合把耗时 / token 当成需要一直盯着的指标的场景
   *
   * 注意：触摸设备（`@media (hover: none)`）上 `'hover'` 会退化为常显——
   * 没有 hover 就没有「悬停」这个动作，藏起来等于用户永远看不到。
   * @default 'hover'
   */
  visibility?: 'always' | 'hover'
}

/**
 * 消息操作栏配置（气泡下方的复制 / 重新生成按钮）。
 */
export interface MessageActionsConfig {
  /**
   * 是否显示操作栏
   * @default true
   */
  enable?: boolean
  /**
   * 是否显示「复制」按钮（user / assistant 消息都会显示）
   * @default true
   */
  copy?: boolean
  /**
   * 是否显示「重新生成」按钮（仅 assistant 消息，且不再处于流式状态时）
   * @default true
   */
  retry?: boolean
  /**
   * 「重新生成」是否只出现在最后一条 assistant 消息上。
   * 设为 false 则历史消息也显示（适合需要分支 / 重新回答的场景）
   * @default true
   */
  retryOnlyLast?: boolean
  /**
   * 复制成功后提示文案的停留时长（毫秒）
   * @default 1600
   */
  copiedDuration?: number
}

/** 一条对话消息 */
export interface ChatMessage {
  /** 唯一 id */
  id: string
  /** 角色 */
  role: MessageRole
  /** 正文内容（Markdown） */
  content: string
  /** 思考 / 推理过程内容（Markdown） */
  reasoning?: string
  /** 思考内容状态 */
  reasoningStatus?: ReasoningStatus
  /** 消息状态 */
  status?: MessageStatus
  /** 附件列表 */
  attachments?: ChatAttachment[]
  /** 工具调用列表（仅 assistant 消息） */
  toolCalls?: ToolCall[]
  /** 创建时间戳 */
  createdAt?: number
  /**
   * 生成结束时间戳。
   * 由 `useStreaming().finish()` 自动写入，用于推导耗时；也可自行赋值
   */
  finishedAt?: number
  /**
   * 第一个分片到达的时间戳。
   * 由 `useStreaming().append()` 自动写入，用于推导首字延迟
   */
  firstTokenAt?: number
  /**
   * 第一个思考分片到达的时间戳。
   * 由 `useStreaming().append()` 自动写入，用于推导思考段耗时
   */
  reasoningStartedAt?: number
  /**
   * 最近一个思考分片的时间戳（流式期间随分片推进，停止后即思考结束时刻）。
   * 由 `useStreaming().append()` 自动写入
   */
  reasoningEndedAt?: number
  /** 耗时 / token 用量等运行元信息 */
  meta?: MessageStats
  /** 错误信息（status === 'error' 时） */
  error?: string
  /** 头像覆盖（URL） */
  avatar?: string
}

/** 图片预览灯箱里的一项 */
export interface PreviewImage {
  /** 图片地址（URL / data URL） */
  src: string
  /** 展示用文件名 */
  name?: string
}

/** 预设问题 */
export interface PresetQuestion {
  /** 唯一 id */
  id: string
  /** 展示文案 */
  label: string
  /** 点击后发送的内容 */
  prompt: string
  /** 可选 SVG 图标名（见 icons 组件） */
  icon?: string
}

/** 追问建议配置项。两种简写形式：直接传数组，或传完整 config 对象 */
export type FollowupInput = PresetQuestion[] | FollowupConfig

/** 向用户提问（智能体 ask_user 一类的交互，见 AskUserPanel） */
export interface AskUserQuestion {
  /** 问题正文 */
  question: string
  /** 选项列表；为空表示只能自由输入 */
  options?: string[]
  /**
   * 是否多选。
   * 多选时需要勾选后点「提交回答」；单选点选项即提交。
   * @default false
   */
  multiple?: boolean
  /**
   * 除选项外是否还允许自由输入。
   * 选项为空时恒为 true（否则用户无内容可答）。
   * @default true
   */
  allowFreeText?: boolean
}

/** 提问面板可覆盖的文案（宿主项目要走 i18n 时传自己的翻译） */
export interface AskUserLabels {
  /** 未作答时的面板标题 */
  title: string
  /** 已作答时的面板标题 */
  answered: string
  /** 自由输入框占位 */
  placeholder: string
  /** 提交按钮文案 */
  submit: string
}

/** 会话列表里的一条会话（见 ConversationList） */
export interface ConversationItem {
  /** 唯一 id */
  id: string
  /** 标题（为空时组件显示 labels.untitled） */
  title: string
  /** 次级展示文案：时间 / 条数等，**已由消费方格式化**（库不做相对时间与 i18n） */
  meta?: string
  /**
   * 生成中徽标文案（如"正在生成中..."）。
   * 非空时替代 meta 展示，并带一个脉冲圆点。
   */
  generatingText?: string
  /** 角标文案（如来源 'CLI'） */
  badge?: string
  /** 参与搜索匹配但不展示（如模型名） */
  searchText?: string
}

/** 会话列表可覆盖的文案（宿主项目要走 i18n 时传自己的翻译） */
export interface ConversationListLabels {
  /** 新建按钮 */
  newConversation: string
  /** 搜索框占位 */
  searchPlaceholder: string
  /** 空列表标题 */
  empty: string
  /** 空列表补充说明 */
  emptyHint: string
  /** 搜索无结果 */
  noResult: string
  /** 加载中 */
  loading: string
  /** 重命名按钮 title / aria-label */
  rename: string
  /** 删除按钮 title / aria-label */
  delete: string
  /** 标题为空时的兜底文案 */
  untitled: string
}

/**
 * 追问建议配置
 * - 静态：传 `items`，每条 assistant 完成后展示同样的追问
 * - 动态：传 `provider(lastMessage, history)`，组件会在每轮 assistant 完成时异步调用
 */
export interface FollowupConfig {
  /** 静态追问列表（与 provider 二选一；同时传时优先 items） */
  items?: PresetQuestion[]
  /**
   * 动态生成追问建议
   * @param lastMessage 最新一条消息（通常是 assistant 的回复）
   * @param history 完整消息历史
   */
  provider?: (
    lastMessage: ChatMessage,
    history: ChatMessage[]
  ) => PresetQuestion[] | Promise<PresetQuestion[]>
  /** 区段标题，默认"继续追问" */
  title?: string
  /**
   * 触发模式
   * - 'after-answer'：每条 assistant 完成（status === 'done'）后展示
   * - 'latest'：仅展示最后一条消息对应的追问（避免历史消息下挤满屏幕）
   * @default 'latest'
   */
  mode?: 'after-answer' | 'latest'
  /** 是否在 assistant 正在流式输出时也展示（默认 false：等回复完成再展示） */
  showDuringStreaming?: boolean
  /** 点击后是否自动填充到输入框（false=直接发送）。默认 true（直接发送） */
  autoSend?: boolean
}

/** 流式 chunk 类型 */
export type StreamChunkType = 'content' | 'reasoning' | 'tool_call_start' | 'tool_result' | 'done' | 'error'

/** 流式输出分片 */
export interface StreamChunk {
  /** 分片类型 */
  type: StreamChunkType
  /** 增量文本（content / reasoning 时） */
  delta?: string
  /** 错误信息（error 时） */
  error?: string
}

/** 主题模式 */
export type ThemeMode = 'light' | 'dark'

/** 图表块的渲染状态（写在 `data-state` 上，样式按它切显隐） */
export type MermaidState = 'pending' | 'streaming' | 'rendering' | 'done' | 'error'

/**
 * 图表块可覆盖的文案。
 * 默认值是中文（与库内其它组件一致），宿主走 i18n 时用 `setMermaidConfig({ labels })` 覆盖。
 */
export interface MermaidLabels {
  /** 切到源码视图的按钮文案，默认「源码」 */
  source?: string
  /** 切回图表视图的按钮文案，默认「图表」 */
  chart?: string
  /** 流式输出中占位文案，默认「正在生成图表…」 */
  loading?: string
  /** 渲染失败时跟在源码前的说明，默认「图表渲染失败，已显示源码」 */
  error?: string
  /** 图表头「放大」按钮文案（打开全屏查看器），默认「放大」 */
  zoom?: string
  /** 查看器：放大一档，默认「放大」 */
  zoomIn?: string
  /** 查看器：缩小一档，默认「缩小」 */
  zoomOut?: string
  /** 查看器：回到适应窗口，默认「适应窗口」 */
  zoomReset?: string
  /** 查看器：关闭，默认「关闭」 */
  close?: string
  /** 查看器底部的操作提示，默认「滚轮缩放 · 拖动平移 · 双击复位 · Esc 关闭」 */
  zoomHint?: string
}

/** mermaid 主题变量（键即 mermaid 的 themeVariables 键名） */
export type MermaidThemeVariables = Record<string, string>

/**
 * 图表（```mermaid）渲染配置。
 * 通过 `setMermaidConfig()` 设置，全局生效；不配置就是「默认开、跟随组件库配色」。
 */
export interface MermaidBlockConfig {
  /**
   * 是否渲染图表。关掉后 ```mermaid 退回普通代码块（源码仍可见）
   * @default true
   */
  enabled?: boolean
  /**
   * 按主题覆盖 mermaid 的 themeVariables。
   * 默认从 `--acu-*` 令牌取色（宿主换肤时图表跟着变），读不到时用内置兜底色板。
   */
  themeVariables?: { light?: MermaidThemeVariables; dark?: MermaidThemeVariables }
  /**
   * 透传给 `mermaid.initialize()` 的其它配置（`flowchart` / `securityLevel` / `fontFamily`…）。
   *
   * ⚠️ `securityLevel` 默认 `'strict'`（SVG 经 DOMPurify 清洗）。模型输出是不可信内容，
   * 改成 `'loose'` 会放行 SVG 里的 HTML/事件属性，请只在完全可信的来源下这么做。
   */
  options?: Record<string, unknown>
  /**
   * 正文里图表的**缩放下限**：容器不够宽时，图最多缩到这个倍数就不再缩了
   * （保持原始尺寸 + 横向滚动），免得整张等比缩小把字压成 4~5px。
   *
   * 传 0 关闭下限（永远适应容器宽度，与旧版一致）。
   * @default 0.8（14px 正文 ≈ 11px，再小就读不动了）
   */
  minScale?: number
  /** 文案覆盖 */
  labels?: MermaidLabels
  /** 图表类型标题覆盖，键见 `MERMAID_TYPE_NAMES`（如 `{ flowchart: '流程' }`） */
  typeNames?: Record<string, string>
}


/** 附件上传配置 */
export interface UploadConfig {
  /** 是否启用附件上传 */
  enabled: boolean
  /** 接受的文件类型，如 'image/*' */
  accept?: string
  /** 最大文件数 */
  maxCount?: number
  /** 单文件最大字节 */
  maxSize?: number
  /** 是否允许多选 */
  multiple?: boolean
}

/**
 * 上下文占用指示（`ChatInput.contextUsage`）——
 * 浮在输入框正上方的深色气泡，底部带尖角指向输入框。
 *
 * 形态参考 WorkBuddy 的实际观感（2026-10-07 量得：气泡 221×28、圆角 ≈8px、
 * 底色 rgb(68,70,98)、尖角高 4px 底宽 6px 位于底边偏左）。
 *
 * ── 为什么库里要有这个 ────────────────────────────────────────────
 * 「这次请求带了 25.6% 的上下文」这件事修饰的是**你即将发出的这条消息**，
 * 不是上方那段对话。放在输入框外面（哪怕紧贴着它），用户会以为它在讲上一轮；
 * 放进对话区更糟 —— 那是气泡列表的位置。
 * 所以它是输入框的一部分，由输入框自己渲染。
 *
 * ── 为什么只给数据、不给算法 ──────────────────────────────────────
 * 库刻意**不算**占用率：怎么算占用取决于业务口径（按字符？按 token？两条预算
 * 取较大者？provider 报的真实用量还是本地估算？），这些各不相同且会随版本变。
 * 库一旦把口径写死，每个想用它的宿主都得先绕开它 —— 于是又回到"同一口径
 * 抄多份"的老路（这仓库已经在提示词、路径归一上吃过亏）。
 * 所以宿主算好 `{ ratio, current, total }` 传进来，库只负责排版与配色。
 *
 * 注意气泡里**没有进度条**：文案里的百分比本身就是刻度，再加一根条是重复表达。
 *
 * 形状刻意对齐「一个比例 + 两个数字」：足以画出进度、写出 `25.6% · 255.9K / 1000.0K`，
 * 又不预设单位（字符还是 token 由宿主在 `unit` 里说明）。
 */
export interface ContextUsage {
  /**
   * 占用比例，**宿主已归一化到 0~1**。
   * 库不再夹取 —— 传 1.2 是宿主算错了，悄悄夹到 100% 会把 bug 藏起来。
   * 大于 1 时按满格画（视觉上就是"满了"），但仍用 ratio 算百分比文字。
   */
  ratio: number
  /** 当前用量，如 255.9（配 `unit` 显示成 `255.9K`） */
  current: number
  /** 上限，如 1000（配 `unit` 显示成 `1000.0K`） */
  total: number
  /**
   * 单位后缀，如 `'K'` / `'字符'` / `' tokens'`。
   * 数字会按 `K` 这类后缀自动除：unit 以 K 结尾时把 current/total 除以 1000，
   * 否则原样显示。这样宿主不用自己拼 "255.9K" 这种字符串。
   */
  unit?: string
  /**
   * 悬停（title）详情。多行用 `\n` 分隔。
   * 不传则只显示那一行摘要 —— 多数场景这样就够了。
   */
  detail?: string
  /**
   * 阈值档位。不传时按 ratio 自动判断：`>= 0.8` 走 warn，`>= 1` 走 full。
   * 想让配色跟随业务语义（比如"接近预算上限"在别的产品里是好事）可以显式指定。
   */
  level?: 'normal' | 'warn' | 'full'
  /** 摘要里 ratio 之后的那段说明，如「上下文已使用」。不传则不显示。 */
  suffix?: string
}

/**
 * 排队中的一条消息（`ChatInput.queued`）。
 *
 * 生成中用户也要能继续打字发送 —— 发出去的消息先进队列，等本轮结束后依次发出。
 * 库只负责**展示与交互**（条带、移除、手动接续）：谁进队列、什么时候出队全由宿主
 * 决定 —— 库手里没有那条流的句柄，不知道它什么时候结束，也不该去猜。
 *
 * ── 为什么条带长在输入框里 ──────────────────────────────────────
 * 排队项是"你即将发出的消息"，和待发附件是同一类东西，所以它和附件预览同住在
 * 输入框卡片里（排在附件行上方）。放进消息列表会污染历史（它们还没发出去），
 * 放在输入框外面又会被当成在讲上一轮。
 *
 * ── 为什么只有展示字段 ──────────────────────────────────────────
 * 队列本体（File 对象、请求参数快照）留在宿主手里 —— 库只拿渲染需要的那点信息
 * （文本 + 附件文件名），不碰宿主的数据结构，宿主换存储形态不用动库。
 */
export interface QueuedMessage {
  /** 唯一 id，移除时原样回传（`unqueue` 事件） */
  id: string
  /** 消息正文（条带里单行截断） */
  text: string
  /** 附件文件名（有则在正文右侧显示，超宽省略） */
  attachmentNames?: string[]
}

/**
 * 排队条带的文案覆盖（宿主项目要走 i18n 时传自己的翻译）。
 *
 * 与 `AskUserLabels` 同一套路：库给中文默认值，宿主逐字段覆盖。
 */
export interface QueueLabels {
  /** 条带标题，默认「排队中」 */
  title?: string
  /** 生成中的提示，默认「等本轮跑完依次发送」 */
  hint?: string
  /**
   * 暂停态提示（`queuePaused` 为 true 时替代 `hint`）。
   * 默认「已暂停，点「立即发送」继续」
   */
  pausedHint?: string
  /** 生成中发送按钮的文案（aria-label / title），默认「加入队列」 */
  send?: string
  /** 队首「立即发送」按钮文案，默认「立即发送」 */
  flush?: string
  /** 移除按钮文案（aria-label / title），默认「移出队列」 */
  remove?: string
}

/** 附件选择回调参数 */
export interface SelectedFile {
  file: File
  id: string
  preview?: string
}

export type { VNode } from 'vue'
