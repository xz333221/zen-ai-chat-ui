// ============================================================
// ai-chat-ui · 流式输出管理
// 提供 appendChunk / finish / error 等方法，管理当前流式消息增量追加，
// 触发响应式更新；配合 MessageList 自动滚动。
// 设计为“无状态工具 + 响应式消息对象”模式，消费方持有消息引用，
// composable 负责按 StreamChunk 类型分发到 content / reasoning。
//
// 顺带记录三个时间戳（createdAt / firstTokenAt / finishedAt），
// 在 finish() 时回填 meta 里的耗时与首字延迟——这两个数字消费方
// 自己算也行，但很容易在重试、并发、多处 finish 的情况下算错。
// ============================================================
import { reactive } from 'vue'
import type { ChatMessage, MessageStats, StreamChunk } from '@/types'

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

/**
 * 清空一条消息的计时状态。
 *
 * 「重新生成」时用：只改 content 会让旧的 finishedAt / firstTokenAt 留着，
 * 新一次生成算出来的耗时会是从上一次开始算的——这个 bug 很隐蔽，
 * 因为数字看着仍然「像个耗时」。
 */
export function resetStreamTiming(message: ChatMessage): void {
  message.createdAt = Date.now()
  message.finishedAt = undefined
  message.firstTokenAt = undefined
  // usage 是接口按次返回的，一并清掉，避免新一次生成时还挂着上一次的 token 数
  message.meta = undefined
}

/** 把时间戳折算成 meta 里的 durationMs / firstTokenMs，不覆盖已显式设置的值 */
function stampMeta(message: ChatMessage): void {
  const start = message.createdAt
  const end = message.finishedAt
  if (typeof start !== 'number' || typeof end !== 'number' || end < start) return

  const meta: MessageStats = { ...(message.meta ?? {}) }
  if (typeof meta.durationMs !== 'number') meta.durationMs = end - start

  const first = message.firstTokenAt
  if (typeof meta.firstTokenMs !== 'number' && typeof first === 'number' && first >= start) {
    meta.firstTokenMs = first - start
  }
  message.meta = meta
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
    // 首个真正带内容的分片 = 首字时刻。done/error 之类的空分片不算。
    if (typeof message.firstTokenAt !== 'number' && (chunk.delta || '').length > 0) {
      message.firstTokenAt = Date.now()
    }

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
    // finish 可能被重复调用（业务侧超时兜底 + 正常收尾），
    // 只认第一次的时间戳，否则耗时会越算越长。
    if (typeof message.finishedAt !== 'number') message.finishedAt = Date.now()
    stampMeta(message)
  }

  function fail(message: ChatMessage, error: string): void {
    message.status = 'error'
    message.error = error
    if (typeof message.finishedAt !== 'number') message.finishedAt = Date.now()
    stampMeta(message)
  }

  return { append, finish, fail, createAssistant }
}
