<template>
  <!--
    消息列表。
    - 流式输出时自动滚动到底部（仅当用户已在底部附近，避免打断阅读）
    - 提供"回到底部"浮动按钮
  -->
  <div ref="scrollRef" class="acu-message-list" @scroll="handleScroll">
    <div class="acu-message-list-inner">
      <MessageBubble
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
        :assistant-name="assistantName"
        :assistant-avatar="assistantAvatar"
        :user-avatar="userAvatar"
        :show-avatar="showAvatar"
        @retry="(m) => $emit('retry', m)"
      />
    </div>

    <transition name="acu-fade">
      <button
        v-show="!atBottom && messages.length > 0"
        type="button"
        class="acu-scroll-btn"
        aria-label="回到底部"
        @click="scrollToBottom(true)"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import type { ChatMessage } from '@/types'
import MessageBubble from '@/components/MessageBubble/MessageBubble.vue'

const props = withDefaults(
  defineProps<{
    messages: ChatMessage[]
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

const scrollRef = ref<HTMLElement | null>(null)
const atBottom = ref(true)
const THRESHOLD = 80

function handleScroll() {
  const el = scrollRef.value
  if (!el) return
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  atBottom.value = distance < THRESHOLD
}

function scrollToBottom(smooth = false) {
  const el = scrollRef.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  atBottom.value = true
}

// 内容签名：用于监听流式增量
function contentSignature(): string {
  const last = props.messages[props.messages.length - 1]
  if (!last) return ''
  return `${props.messages.length}:${last.id}:${last.content.length}:${last.reasoning?.length ?? 0}`
}

watch(contentSignature, () => {
  if (atBottom.value) {
    nextTick(() => scrollToBottom(false))
  }
})

watch(
  () => props.messages.length,
  () => {
    // 新增消息（含首条）直接滚到底
    nextTick(() => scrollToBottom(false))
  }
)

onMounted(() => scrollToBottom(false))

defineExpose({ scrollToBottom })
</script>

<style lang="scss" scoped>
.acu-message-list {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  @include acu-scrollbar;

  scroll-behavior: auto;
}

.acu-message-list-inner {
  display: flex;
  flex-direction: column;
  gap: var(--acu-space-5);
  max-width: var(--acu-max-width);
  width: 100%;
  margin: 0 auto;
  padding: var(--acu-space-5) var(--acu-space-4) var(--acu-space-6);
}

.acu-scroll-btn {
  position: sticky;
  bottom: var(--acu-space-3);
  left: 50%;
  transform: translateX(-50%);
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--acu-border);
  background: var(--acu-bg);
  color: var(--acu-text-secondary);
  border-radius: var(--acu-radius-full);
  cursor: pointer;
  box-shadow: var(--acu-shadow);
  transition: all var(--acu-duration) var(--acu-easing);
  z-index: 2;
  margin: 0 auto;

  &:hover {
    color: var(--acu-primary);
    border-color: var(--acu-primary);
  }
}

.acu-fade-enter-active,
.acu-fade-leave-active {
  transition: opacity var(--acu-duration) var(--acu-easing),
    transform var(--acu-duration) var(--acu-easing);
}
.acu-fade-enter-from,
.acu-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px);
}
</style>
