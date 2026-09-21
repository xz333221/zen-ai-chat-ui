// ============================================================
// ai-chat-ui · 统一导出入口
// 消费方：import { ChatContainer, useStreaming } from 'ai-chat-ui'
//         import 'ai-chat-ui/style.css'
// ============================================================
import './styles/index.scss'

// 组件
export { default as ChatContainer } from './components/ChatContainer/ChatContainer.vue'
export { default as MessageList } from './components/MessageList/MessageList.vue'
export { default as MessageBubble } from './components/MessageBubble/MessageBubble.vue'
export { default as ThinkingBlock } from './components/ThinkingBlock/ThinkingBlock.vue'
export { default as ToolCallBlock } from './components/ToolCallBlock/ToolCallBlock.vue'
export { default as ToolCallGroup } from './components/ToolCallGroup/ToolCallGroup.vue'
export { default as MessageActions } from './components/MessageActions/MessageActions.vue'
export { default as WelcomeScreen } from './components/WelcomeScreen/WelcomeScreen.vue'
export { default as ChatInput } from './components/ChatInput/ChatInput.vue'
export { default as MarkdownRenderer } from './components/MarkdownRenderer/MarkdownRenderer.vue'
export { default as FollowupSuggestions } from './components/FollowupSuggestions/FollowupSuggestions.vue'
export { default as MessageMeta } from './components/MessageMeta/MessageMeta.vue'
export { default as ImagePreview } from './components/ImagePreview/ImagePreview.vue'

// composables
export {
  useMarkdown,
  isShikiReady,
  ensureHighlighter,
  extractThinkSegments
} from './composables/useMarkdown'
export { useStreaming, resetStreamTiming } from './composables/useStreaming'

// 工具
export { formatFileSize, isImageType, uid, formatDuration, formatTokens, formatClock } from './utils/format'

// 内置 AI 品牌头像（由 scripts/build-avatars.mjs 生成）
export {
  AI_AVATARS,
  AI_AVATAR_PRESETS,
  resolveAvatar,
  avatarClaude,
  avatarCodex,
  avatarKimi,
  avatarOpencode,
  avatarZcode,
  avatarOpenai,
  avatarGemini,
  avatarMistral,
  avatarCopilot,
  avatarCursor,
  avatarPerplexity,
  avatarOllama,
  avatarHuggingface
} from './avatars'

// 类型
export type {
  MessageRole,
  MessageStatus,
  ReasoningStatus,
  ChatAttachment,
  ChatMessage,
  ToolCall,
  ToolCallStatus,
  ToolCallsConfig,
  ThinkingConfig,
  MessageActionsConfig,
  TokenUsage,
  MessageStats,
  MessageMetaExtra,
  MessageMetaItem,
  MessageMetaConfig,
  PreviewImage,
  PresetQuestion,
  FollowupInput,
  FollowupConfig,
  StreamChunkType,
  StreamChunk,
  ThemeMode,
  UploadConfig,
  SelectedFile
} from './types'

export type { AiAvatarKey, AiAvatarPreset } from './avatars'

// 组件 Vue 插件安装（可选：app.use(AiChatUi)）
import type { App } from 'vue'
import ChatContainer from './components/ChatContainer/ChatContainer.vue'

const install = (app: App): void => {
  app.component('ChatContainer', ChatContainer)
  // 插件用户可选用 app.use(AiChatUi) 全局注册主组件
}

export default { install }
