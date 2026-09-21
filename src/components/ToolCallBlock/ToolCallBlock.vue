<template>
  <!--
    工具调用块：渲染 LLM 的 function call 及其执行结果。
    - 折叠式：默认收起，点击展开查看参数和结果
    - 状态图标：running 旋转、done 勾、error 叉
    - 工具名 + 参数预览 → 结果（可滚动）
  -->
  <div class="acu-toolcall">
    <button
      type="button"
      class="acu-toolcall-header"
      :class="{ expanded }"
      @click="expanded = !expanded"
    >
      <!-- 状态图标 -->
      <span class="acu-toolcall-status" :class="`is-${status}`">
        <svg v-if="status === 'running'" class="acu-spin" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <svg v-else-if="status === 'done'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <svg v-else-if="status === 'error'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </span>

      <!-- 工具图标 -->
      <span class="acu-toolcall-icon">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      </span>

      <!-- 工具名 + 参数预览 -->
      <span class="acu-toolcall-name">{{ toolCall.name }}</span>
      <span v-if="toolCall.argsPreview" class="acu-toolcall-args">{{ toolCall.argsPreview }}</span>

      <!-- 展开/收起箭头 -->
      <svg class="acu-toolcall-chevron" :class="{ expanded }" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <!-- 展开内容 -->
    <transition name="acu-toolcall-slide">
      <div v-if="expanded" class="acu-toolcall-body">
        <!-- 参数 -->
        <div v-if="toolCall.arguments" class="acu-toolcall-section">
          <div class="acu-toolcall-section-label">参数</div>
          <pre class="acu-toolcall-pre">{{ formatArgs(toolCall.arguments) }}</pre>
        </div>
        <!-- 结果 -->
        <div v-if="toolCall.result !== undefined" class="acu-toolcall-section">
          <div class="acu-toolcall-section-label">结果</div>
          <pre class="acu-toolcall-pre acu-toolcall-result" :class="`is-${status}`">{{ toolCall.result }}</pre>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ToolCall, ToolCallStatus } from '@/types'

const props = defineProps<{
  toolCall: ToolCall
}>()

const expanded = ref(false)

const status = computed<ToolCallStatus>(() => props.toolCall.status || 'pending')

function formatArgs(args: string): string {
  try {
    return JSON.stringify(JSON.parse(args), null, 2)
  } catch {
    return args
  }
}
</script>

<style lang="scss" scoped>
.acu-toolcall {
  border: 1px solid var(--acu-border);
  border-radius: var(--acu-radius-sm);
  overflow: hidden;
  margin: var(--acu-space-1) 0;
  background: var(--acu-surface);
}

.acu-toolcall-header {
  display: flex;
  align-items: center;
  gap: var(--acu-space-2);
  width: 100%;
  padding: var(--acu-space-1-5) var(--acu-space-2-5);
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  font-size: var(--acu-font-size-sm);
  color: var(--acu-text-secondary);
  transition: background var(--acu-duration-fast) var(--acu-easing);

  &:hover {
    background: var(--acu-surface-2);
  }
}

.acu-toolcall-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;

  &.is-running { color: var(--acu-primary); }
  &.is-done { color: var(--acu-success); }
  &.is-error { color: var(--acu-error); }
  &.is-pending { color: var(--acu-text-muted); }
}

.acu-toolcall-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--acu-text-muted);
  flex-shrink: 0;
}

.acu-toolcall-name {
  font-weight: 600;
  color: var(--acu-text);
  font-family: var(--acu-font-mono);
  font-size: var(--acu-font-size-xs);
  flex-shrink: 0;
}

.acu-toolcall-args {
  color: var(--acu-text-muted);
  font-family: var(--acu-font-mono);
  font-size: var(--acu-font-size-xs);
  @include acu-ellipsis(1);
  min-width: 0;
}

.acu-toolcall-chevron {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--acu-text-muted);
  transition: transform var(--acu-duration-fast) var(--acu-easing);

  &.expanded {
    transform: rotate(180deg);
  }
}

.acu-toolcall-body {
  border-top: 1px solid var(--acu-border);
  padding: var(--acu-space-2) var(--acu-space-3);
  background: var(--acu-surface-2);
}

.acu-toolcall-section {
  & + & {
    margin-top: var(--acu-space-2);
  }
}

.acu-toolcall-section-label {
  font-size: var(--acu-font-size-2xs);
  color: var(--acu-text-muted);
  margin-bottom: var(--acu-space-1);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.acu-toolcall-pre {
  margin: 0;
  padding: var(--acu-space-2) var(--acu-space-2-5);
  background: var(--acu-surface);
  border-radius: var(--acu-radius-xs);
  font-family: var(--acu-font-mono);
  font-size: var(--acu-font-size-xs);
  line-height: var(--acu-line-height-tight);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
  color: var(--acu-text);

  &.is-error {
    color: var(--acu-error);
  }
}

// 动画
.acu-toolcall-slide-enter-active,
.acu-toolcall-slide-leave-active {
  // 折叠动画只需要这几个属性；写成 all 会把子元素的任意样式变化也纳入过渡
  transition: max-height var(--acu-duration-fast) var(--acu-easing),
    opacity var(--acu-duration-fast) var(--acu-easing),
    padding-top var(--acu-duration-fast) var(--acu-easing),
    padding-bottom var(--acu-duration-fast) var(--acu-easing);
  overflow: hidden;
}
.acu-toolcall-slide-enter-from,
.acu-toolcall-slide-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}

// 旋转动画
.acu-spin {
  animation: acu-spin 0.8s linear infinite;
}
@keyframes acu-spin {
  to { transform: rotate(360deg); }
}
</style>
