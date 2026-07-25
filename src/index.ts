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
export { default as WelcomeScreen } from './components/WelcomeScreen/WelcomeScreen.vue'
export { default as ChatInput } from './components/ChatInput/ChatInput.vue'
export { default as MarkdownRenderer } from './components/MarkdownRenderer/MarkdownRenderer.vue'
export { default as FollowupSuggestions } from './components/FollowupSuggestions/FollowupSuggestions.vue'

// composables
export { useMarkdown, isShikiReady, ensureHighlighter } from './composables/useMarkdown'
export { useStreaming } from './composables/useStreaming'

// 工具
export { formatFileSize, isImageType, uid } from './utils/format'

// 类型
export type {
  MessageRole,
  MessageStatus,
  ReasoningStatus,
  ChatAttachment,
  ChatMessage,
  ToolCall,
  ToolCallStatus,
  PresetQuestion,
  FollowupInput,
  FollowupConfig,
  StreamChunkType,
  StreamChunk,
  ThemeMode,
  UploadConfig,
  SelectedFile
} from './types'

// 组件 Vue 插件安装（可选：app.use(AiChatUi)）
import type { App } from 'vue'
import ChatContainer from './components/ChatContainer/ChatContainer.vue'

const install = (app: App): void => {
  app.component('ChatContainer', ChatContainer)
  // 插件用户可选用 app.use(AiChatUi) 全局注册主组件
}

export default { install }
