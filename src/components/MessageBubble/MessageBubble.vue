<template>
  <!--
    单条消息气泡。
    - user：右对齐，主色气泡，头像在右
    - assistant：左对齐，浅色气泡 + 头像 + 名称；含思考块、Markdown 正文、流式光标、附件
  -->
  <div class="acu-bubble-row" :class="`is-${message.role}`">
    <!-- ===== 左侧头像（仅 assistant） ===== -->
    <div v-if="message.role === 'assistant' && showAvatar" class="acu-avatar acu-avatar--left">
      <img v-if="resolvedAssistantAvatar" :src="resolvedAssistantAvatar" alt="" />
      <svg
        v-else
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
        <path d="M19 14l.8 1.9L21.7 17l-1.9.8L19 19.7l-.8-1.9L16.3 17l1.9-.8L19 14z" />
      </svg>
    </div>

    <!-- ===== 中间内容区 ===== -->
    <div class="acu-bubble-main">
      <!-- assistant 名称 -->
      <div v-if="message.role === 'assistant'" class="acu-bubble-name">
        {{ assistantName }}
      </div>

      <!-- 附件（user 显示在正文上方） -->
      <div v-if="hasAttachments" class="acu-attachments" :class="`is-${message.role}`">
        <template v-for="att in message.attachments" :key="att.id">
          <div v-if="isImageType(att.type) && att.preview" class="acu-att-thumb">
            <img :src="att.preview" :alt="att.name" loading="lazy" />
          </div>
          <div v-else class="acu-att-file">
            <span class="acu-att-file-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </span>
            <span class="acu-att-file-info">
              <span class="cu-att-file-name" :title="att.name">{{ att.name }}</span>
              <span class="acu-att-file-size">{{ formatFileSize(att.size) }}</span>
            </span>
          </div>
        </template>
      </div>

      <!-- 气泡内容区 -->
      <div class="acu-bubble" :class="`is-${message.role}`">
        <!-- 思考块（仅 assistant） -->
        <ThinkingBlock
          v-if="message.role === 'assistant' && message.reasoning"
          :content="message.reasoning"
          :streaming="message.reasoningStatus === 'streaming'"
        />

        <!-- 正文 -->
        <div v-if="message.content" class="acu-bubble-content">
          <MarkdownRenderer :source="message.content" />
          <span
            v-if="isStreamingContent"
            class="acu-cursor"
            aria-hidden="true"
          ></span>
        </div>

        <!-- pending：等待响应 -->
        <div v-else-if="message.role === 'assistant' && message.status === 'pending'" class="acu-pending">
          <span class="acu-typing-dots" aria-label="正在思考">
            <span></span><span></span><span></span>
          </span>
        </div>

        <!-- 错误态 -->
        <div v-if="message.status === 'error'" class="acu-bubble-error">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{{ message.error || '生成失败，请重试' }}</span>
          <button type="button" class="acu-retry-btn" @click="$emit('retry', message)">重试</button>
        </div>
      </div>
    </div>

    <!-- ===== 右侧头像（仅 user） ===== -->
    <div v-if="message.role === 'user' && showAvatar" class="acu-avatar acu-avatar--right">
      <img v-if="resolvedUserAvatar" :src="resolvedUserAvatar" alt="" />
      <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage } from '@/types'
import { formatFileSize, isImageType } from '@/utils/format'
import MarkdownRenderer from '@/components/MarkdownRenderer/MarkdownRenderer.vue'
import ThinkingBlock from '@/components/ThinkingBlock/ThinkingBlock.vue'

const props = withDefaults(
  defineProps<{
    message: ChatMessage
    assistantName?: string
    assistantAvatar?: string
    userAvatar?: string
    showAvatar?: boolean
  }>(),
  {
    assistantName: 'AI 助手',
    assistantAvatar: '',
    userAvatar: '',
    showAvatar: true
  }
)

defineEmits<{
  (e: 'retry', message: ChatMessage): void
}>()

const resolvedAssistantAvatar = computed(() => props.message.avatar || props.assistantAvatar)
const resolvedUserAvatar = computed(() => props.userAvatar)
const hasAttachments = computed(() => !!props.message.attachments?.length)
const isStreamingContent = computed(
  () =>
    props.message.role === 'assistant' &&
    props.message.status === 'streaming' &&
    !!props.message.content
)
</script>

<style lang="scss" scoped>
.acu-bubble-row {
  display: flex;
  gap: var(--acu-space-3);
  align-items: flex-start;

  // user 消息：整行靠右，头像在右侧（DOM 顺序不变）
  &.is-user {
    justify-content: flex-end;
  }
}

// —— 头像（左右两侧共用基础样式） ——
.acu-avatar {
  flex-shrink: 0;
  width: var(--acu-avatar-size);
  height: var(--acu-avatar-size);
  border-radius: var(--acu-radius-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  // 左侧头像：assistant
  &--left {
    background: var(--acu-surface-2);
    color: var(--acu-text-secondary);
  }

  // 右侧头像：user
  &--right {
    background: var(--acu-primary-soft);
    color: var(--acu-primary);
  }
}

.acu-bubble-main {
  min-width: 0;
  max-width: min(680px, 78%);
  display: flex;
  flex-direction: column;

  // user 消息内容右对齐
  .is-user & {
    align-items: flex-end;
  }
}

.acu-bubble-name {
  font-size: var(--acu-font-size-xs);
  color: var(--acu-text-muted);
  margin-bottom: var(--acu-space-1);
  padding-left: 2px;
}

.acu-bubble {
  position: relative;
  padding: var(--acu-space-3) var(--acu-space-4);
  border-radius: var(--acu-radius-lg);
  font-size: var(--acu-font-size-md);
  line-height: var(--acu-line-height);
  max-width: 100%;
  word-break: break-word;

  &.is-assistant {
    background: var(--acu-bubble-assistant-bg);
    color: var(--acu-bubble-assistant-text);
    border-top-left-radius: var(--acu-radius-xs);
  }

  &.is-user {
    background: var(--acu-bubble-user-bg);
    color: var(--acu-bubble-user-text);
    border-top-right-radius: var(--acu-radius-xs);
  }
}

.acu-bubble-content {
  // 让 Markdown 内容贴合气泡
  :deep(.acu-md) {
    color: inherit;
    font-size: var(--acu-font-size-md);
  }
}

// 附件区
.acu-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: var(--acu-space-2);
  margin-bottom: var(--acu-space-2);

  &.is-user {
    justify-content: flex-end;
  }
}

.acu-att-thumb {
  width: 88px;
  height: 88px;
  border-radius: var(--acu-radius);
  overflow: hidden;
  border: 1px solid var(--acu-border);
  background: var(--acu-surface);
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.acu-att-file {
  display: inline-flex;
  align-items: center;
  gap: var(--acu-space-2);
  padding: var(--acu-space-2) var(--acu-space-3);
  background: var(--acu-surface);
  border: 1px solid var(--acu-border);
  border-radius: var(--acu-radius-sm);
  max-width: 220px;
}
.acu-att-file-icon {
  color: var(--acu-text-muted);
  flex-shrink: 0;
}
.acu-att-file-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.acu-att-file-name {
  font-size: var(--acu-font-size-sm);
  color: var(--acu-text);
  @include acu-ellipsis(1);
}
.acu-att-file-size {
  font-size: var(--acu-font-size-xs);
  color: var(--acu-text-muted);
}

// pending 态
.acu-pending {
  padding: var(--acu-space-1) 0;
}

// 错误态
.acu-bubble-error {
  display: flex;
  align-items: center;
  gap: var(--acu-space-2);
  margin-top: var(--acu-space-2);
  padding: var(--acu-space-2) var(--acu-space-3);
  background: var(--acu-error-soft);
  color: var(--acu-error);
  border-radius: var(--acu-radius-sm);
  font-size: var(--acu-font-size-sm);
}

.acu-retry-btn {
  margin-left: auto;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  padding: 2px 10px;
  border-radius: var(--acu-radius-xs);
  font-size: var(--acu-font-size-xs);
  font-family: inherit;
  cursor: pointer;
  transition: opacity var(--acu-duration-fast) var(--acu-easing);
  &:hover {
    opacity: 0.75;
  }
}
</style>
