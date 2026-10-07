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
export { default as PlanBlock } from './components/PlanBlock/PlanBlock.vue'
export { default as MessageActions } from './components/MessageActions/MessageActions.vue'
export { default as WelcomeScreen } from './components/WelcomeScreen/WelcomeScreen.vue'
export { default as ChatInput } from './components/ChatInput/ChatInput.vue'
export { default as MarkdownRenderer } from './components/MarkdownRenderer/MarkdownRenderer.vue'
export { default as FollowupSuggestions } from './components/FollowupSuggestions/FollowupSuggestions.vue'
export { default as MessageMeta } from './components/MessageMeta/MessageMeta.vue'
export { default as ImagePreview } from './components/ImagePreview/ImagePreview.vue'
export { default as MermaidPreview } from './components/MermaidPreview/MermaidPreview.vue'
export { default as MessageRail } from './components/MessageRail/MessageRail.vue'
export { default as AskUserPanel } from './components/AskUserPanel/AskUserPanel.vue'
export { default as ConversationList } from './components/ConversationList/ConversationList.vue'

// composables
export {
  useMarkdown,
  isShikiReady,
  ensureHighlighter,
  extractThinkSegments
} from './composables/useMarkdown'
export { useStreaming, resetStreamTiming } from './composables/useStreaming'
export { useResolvedTheme } from './composables/useResolvedTheme'
// 图表（```mermaid）：渲染管线是懒加载的，这里只导出配置与手动补渲染的口子
export {
  setMermaidConfig,
  isMermaidEnabled,
  isMermaidReady,
  renderMermaid,
  renderMermaidBlocks,
  mermaidLabels,
  mermaidTypeLabel,
  isMermaidLang,
  resolveMermaidTheme,
  observeMermaidTheme,
  toggleMermaidSource,
  mermaidPreviewSvg,
  MermaidZoomDefaults,
  MERMAID_LANGS,
  MERMAID_SELECTOR,
  MERMAID_TYPE_NAMES
} from './composables/useMermaid'

// 工具
export { formatFileSize, isImageType, uid, formatDuration, formatTokens, formatClock } from './utils/format'

// 计划（plan）解析：宿主拿原始工具参数就能得到规范步骤
export {
  isPlanTool,
  parsePlanArgs,
  parsePlanNote,
  readPlan,
  planProgress,
  MAX_PLAN_STEPS
} from './utils/plan'
export type { ParsedPlan } from './utils/plan'

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
  PlanStep,
  PlanStepStatus,
  PlanConfig,
  PlanLabels,
  ThinkingConfig,
  MessageActionsConfig,
  TokenUsage,
  MessageStats,
  MessageMetaExtra,
  MessageMetaItem,
  MessageMetaConfig,
  PreviewImage,
  MessageRailConfig,
  PresetQuestion,
  AskUserQuestion,
  AskUserLabels,
  ConversationItem,
  ConversationListLabels,
  FollowupInput,
  FollowupConfig,
  StreamChunkType,
  StreamChunk,
  ThemeMode,
  MermaidBlockConfig,
  MermaidLabels,
  MermaidThemeVariables,
  MermaidState,
  UploadConfig,
  ContextUsage,
  QueuedMessage,
  QueueLabels,
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
