<template>
  <!--
    思考（reasoning）内容块。
    - streaming：默认展开，标题显示"思考中"+三点动画，正文带流式光标
    - done：可折叠，标题显示"已深度思考"，默认折叠
    - 样式区别于正式回答：弱化配色、左侧细线、更小字号
  -->
  <div class="acu-thinking" :class="{ 'is-streaming': streaming }">
    <button
      type="button"
      class="acu-thinking-header"
      :aria-expanded="expanded"
      @click="toggle"
    >
      <span class="acu-thinking-icon">
        <!-- 思考图标：大脑/灵感线框 -->
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M9.5 2A4.5 4.5 0 0 0 5 6.5c0 .5.08.98.22 1.43A4 4 0 0 0 6 16a3.5 3.5 0 0 0 5 3.05"
          />
          <path
            d="M14.5 2A4.5 4.5 0 0 1 19 6.5c0 .5-.08.98-.22 1.43A4 4 0 0 1 18 16a3.5 3.5 0 0 1-5 3.05"
          />
          <path d="M12 4v16" />
        </svg>
      </span>

      <span class="acu-thinking-title">
        {{ streaming ? '思考中' : '已深度思考' }}
      </span>

      <span v-if="streaming" class="acu-typing-dots" aria-hidden="true">
        <span></span><span></span><span></span>
      </span>

      <svg
        v-else
        class="acu-thinking-chevron"
        :class="{ 'is-open': expanded }"
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <transition name="acu-collapse">
      <div v-show="expanded" class="acu-thinking-body">
        <MarkdownRenderer :source="content" />
        <span v-if="streaming && content" class="acu-cursor" aria-hidden="true"></span>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import MarkdownRenderer from '@/components/MarkdownRenderer/MarkdownRenderer.vue'

const props = withDefaults(
  defineProps<{
    /** 思考内容（Markdown） */
    content: string
    /** 是否仍在流式输出 */
    streaming?: boolean
    /** 初始是否展开 */
    defaultExpanded?: boolean
  }>(),
  {
    content: '',
    streaming: false,
    defaultExpanded: undefined
  }
)

// streaming 时默认展开；done 时默认折叠（除非显式指定）
const expanded = ref(
  props.defaultExpanded !== undefined
    ? props.defaultExpanded
    : props.streaming
)

// streaming 切换：开始流式自动展开
watch(
  () => props.streaming,
  (val) => {
    if (val) expanded.value = true
  }
)

function toggle() {
  expanded.value = !expanded.value
}
</script>

<style lang="scss" scoped>
.acu-thinking {
  margin-bottom: var(--acu-space-3);
  border: 1px solid var(--acu-thinking-border);
  border-radius: var(--acu-radius);
  background: var(--acu-thinking-bg);
  overflow: hidden;

  &.is-streaming {
    border-color: var(--acu-primary-soft);
  }
}

.acu-thinking-header {
  display: flex;
  align-items: center;
  gap: var(--acu-space-2);
  width: 100%;
  padding: var(--acu-space-2) var(--acu-space-3);
  border: none;
  background: transparent;
  color: var(--acu-thinking-text);
  font-size: var(--acu-font-size-sm);
  font-family: inherit;
  cursor: pointer;
  transition: background-color var(--acu-duration-fast) var(--acu-easing);
  @include acu-focus-ring;

  &:hover {
    background: var(--acu-surface-hover);
  }
}

.acu-thinking-icon {
  display: inline-flex;
  color: var(--acu-thinking-icon);
  flex-shrink: 0;

  .is-streaming & {
    color: var(--acu-primary);
    animation: acu-pulse 2s var(--acu-easing) infinite;
  }
}

@keyframes acu-pulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

.acu-thinking-title {
  font-weight: 500;
  letter-spacing: 0.01em;
}

.acu-thinking-chevron {
  margin-left: auto;
  color: var(--acu-text-muted);
  transition: transform var(--acu-duration) var(--acu-easing);
  flex-shrink: 0;

  &.is-open {
    transform: rotate(180deg);
  }
}

.acu-thinking-body {
  padding: 0 var(--acu-space-3) var(--acu-space-3);
  border-top: 1px dashed var(--acu-thinking-border);
  color: var(--acu-thinking-text);
  font-size: var(--acu-font-size-sm);
  line-height: 1.7;

  // 思考内容弱化：比正文更柔
  :deep(.acu-md) {
    font-size: var(--acu-font-size-sm);
    color: var(--acu-thinking-text);
    opacity: 0.92;
  }
  :deep(.acu-md p) {
    margin-bottom: var(--acu-space-2);
  }
}

// 折叠过渡
.acu-collapse-enter-active,
.acu-collapse-leave-active {
  transition: opacity var(--acu-duration) var(--acu-easing),
    transform var(--acu-duration) var(--acu-easing);
}
.acu-collapse-enter-from,
.acu-collapse-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
