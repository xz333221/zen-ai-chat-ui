<template>
  <!--
    消息操作栏：气泡下方一排纯图标按钮。
    - user 消息：复制
    - assistant 消息：复制 + 重新生成（重新生成由父级控制是否出现）
    默认常显；父级（MessageBubble）会在支持 hover 的设备上把它隐藏，
    悬停气泡行 / 键盘聚焦时再淡入。
  -->
  <div class="acu-message-actions" :class="`is-${role}`">
    <button
      v-if="showCopy"
      type="button"
      class="acu-action-btn"
      :class="{ 'is-done': copied }"
      :aria-label="copied ? '已复制' : '复制'"
      :title="copied ? '已复制' : '复制'"
      @click="handleCopy"
    >
      <svg v-if="copied" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <svg v-else viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      <!-- 纯图标后没有文字，用一个短暂浮层明确「复制成功」 -->
      <transition name="acu-tip">
        <span v-if="copied" class="acu-action-tip">已复制</span>
      </transition>
    </button>

    <button
      v-if="showRetry"
      type="button"
      class="acu-action-btn"
      aria-label="重新生成"
      title="重新生成"
      @click="$emit('retry')"
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 2v6h-6" />
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M3 22v-6h6" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import type { MessageRole } from '@/types'

const props = withDefaults(
  defineProps<{
    /** 消息角色，仅用于对齐方向 */
    role: MessageRole
    /** 要复制的文本 */
    copyText: string
    /** 是否显示复制 */
    showCopy?: boolean
    /** 是否显示重新生成 */
    showRetry?: boolean
    /** 「已复制」提示停留时长 */
    copiedDuration?: number
  }>(),
  {
    showCopy: true,
    showRetry: false,
    copiedDuration: 1600
  }
)

defineEmits<{
  (e: 'retry'): void
}>()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

function clearTimer() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

onBeforeUnmount(clearTimer)

// 文本变了（重新生成中）就复位提示态
watch(
  () => props.copyText,
  () => {
    if (!copied.value) return
    copied.value = false
    clearTimer()
  }
)

/** 优先用 Clipboard API（需安全上下文），失败退回 textarea + execCommand */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 继续走兜底方案 */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, ta.value.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

async function handleCopy() {
  const text = props.copyText || ''
  if (!text) return
  const ok = await writeClipboard(text)
  if (!ok) return
  copied.value = true
  clearTimer()
  timer = setTimeout(() => {
    copied.value = false
    timer = null
  }, props.copiedDuration)
}
</script>

<style lang="scss" scoped>
.acu-message-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: var(--acu-space-1);

  // assistant：靠左；user：靠右
  &.is-user {
    justify-content: flex-end;
  }
}

.acu-action-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--acu-radius-xs);
  background: transparent;
  color: var(--acu-text-muted);
  cursor: pointer;
  @include acu-focus-ring(1px);
  transition: color var(--acu-duration-fast) var(--acu-easing),
    background var(--acu-duration-fast) var(--acu-easing),
    border-color var(--acu-duration-fast) var(--acu-easing);

  svg {
    flex-shrink: 0;
  }

  &:hover {
    color: var(--acu-primary);
    background: var(--acu-surface-2);
    border-color: var(--acu-border);
  }

  &.is-done {
    color: var(--acu-success);
  }
}

// 复制成功的浮层提示（纯图标按钮没有文字位）
.acu-action-tip {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  padding: 2px 7px;
  border-radius: var(--acu-radius-xs);
  background: var(--acu-text);
  color: var(--acu-bg);
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
  pointer-events: none;
  z-index: 3;

  // user 侧操作栏靠右，提示改为贴右边缘向左展开，避免顶出容器
  .is-user & {
    left: auto;
    right: 0;
  }
}

.acu-tip-enter-active,
.acu-tip-leave-active {
  transition: opacity var(--acu-duration-fast) var(--acu-easing),
    transform var(--acu-duration-fast) var(--acu-easing);
}
.acu-tip-enter-from,
.acu-tip-leave-to {
  opacity: 0;
  transform: translateY(3px);
}
</style>
