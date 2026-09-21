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
}

/**
 * 消息侧边条（MessageRail）配置。
 *
 * 贴在消息列表左边缘的一条竖直「刻度串」：**一条消息 = 一根短横条**，
 * 条数随对话增长。用来在长篇对话里一眼看清结构（谁问谁答、答了多长）
 * 并快速跳转，形态参考 Codex 侧边那组小横条。
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
   * - `'length'`：按消息内容长度（对数缩放）。形状自然，且流式输出时
   *   最后一根会跟着长出来，自带进度感
   * - `'role'`：按角色固定。user 短、assistant 长，节奏稳定不抖动
   * @default 'length'
   */
  widthBy?: 'length' | 'role'
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

/** 附件选择回调参数 */
export interface SelectedFile {
  file: File
  id: string
  preview?: string
}

export type { VNode } from 'vue'
