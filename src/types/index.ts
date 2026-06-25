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
  /** 创建时间戳 */
  createdAt?: number
  /** 错误信息（status === 'error' 时） */
  error?: string
  /** 头像覆盖（URL） */
  avatar?: string
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

/** 流式 chunk 类型 */
export type StreamChunkType = 'content' | 'reasoning' | 'done' | 'error'

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
