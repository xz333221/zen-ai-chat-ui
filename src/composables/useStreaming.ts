// ============================================================
// ai-chat-ui · 流式输出管理
// 提供 appendChunk / finish / error 等方法，管理当前流式消息增量追加，
// 触发响应式更新；配合 MessageList 自动滚动。
// 设计为“无状态工具 + 响应式消息对象”模式，消费方持有消息引用，
// composable 负责按 StreamChunk 类型分发到 content / reasoning。
// ============================================================
import { reactive } from 'vue'
import type { ChatMessage, StreamChunk } from '@/types'

export interface UseStreamingReturn {
  /** 处理一个流式分片，直接修改传入的 message 对象 */
  append: (message: ChatMessage, chunk: StreamChunk) => void
  /** 结束流式 */
  finish: (message: ChatMessage) => void
  /** 标记错误 */
  fail: (message: ChatMessage, error: string) => void
  /** 创建一条待流式的 assistant 消息 */
  createAssistant: (id?: string) => ChatMessage
}

export function useStreaming(): UseStreamingReturn {
  function createAssistant(id?: string): ChatMessage {
    return reactive<ChatMessage>({
      id: id ?? `acu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'assistant',
      content: '',
      reasoning: '',
      reasoningStatus: undefined,
      status: 'streaming',
      createdAt: Date.now()
    })
  }

  function append(message: ChatMessage, chunk: StreamChunk): void {
    switch (chunk.type) {
      case 'reasoning':
        message.reasoning = (message.reasoning || '') + (chunk.delta || '')
        message.reasoningStatus = 'streaming'
        message.status = 'streaming'
        break
      case 'content':
        message.content += chunk.delta || ''
        // 正文开始后，思考标记为完成
        if (message.reasoningStatus === 'streaming') {
          message.reasoningStatus = 'done'
        }
        message.status = 'streaming'
        break
      case 'done':
        message.reasoningStatus = 'done'
        message.status = 'done'
        break
      case 'error':
        message.status = 'error'
        message.error = chunk.error || '生成失败'
        break
    }
  }

  function finish(message: ChatMessage): void {
    message.reasoningStatus = 'done'
    message.status = 'done'
  }

  function fail(message: ChatMessage, error: string): void {
    message.status = 'error'
    message.error = error
  }

  return { append, finish, fail, createAssistant }
}
