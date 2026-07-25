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
// 基础结构样式（.acu-thinking / .acu-thinking-header / .acu-thinking-icon 等）
// 已迁移到 base.scss 供 ThinkingBlock 与 MarkdownRenderer（v-html 渲染的
// <think>...</think> 块）共享。这里只保留 ThinkingBlock 独有的：
//   1. @include acu-focus-ring（focus-visible 描边，仅组件交互需要）
//   2. 折叠过渡动画（v-show + <transition> 配套）
.acu-thinking-header {
  @include acu-focus-ring;
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

// ThinkingBlock 内的 .acu-md（嵌套 MarkdownRenderer）调小字号、弱化配色
.acu-thinking-body :deep(.acu-md) {
  font-size: var(--acu-font-size-sm);
  color: var(--acu-thinking-text);
  opacity: 0.92;
}
.acu-thinking-body :deep(.acu-md p) {
  margin-bottom: var(--acu-space-2);
}
</style>
