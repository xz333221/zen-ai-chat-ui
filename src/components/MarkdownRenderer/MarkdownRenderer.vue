<template>
  <!--
    Markdown 渲染容器。
    - v-html 输出 markdown-it 解析结果（已禁原始 HTML，安全）
    - 事件委托处理代码块复制按钮
    - 样式为非 scoped（带 .acu-md 前缀隔离），因 v-html 内容无法被 scoped 命中
  -->
  <div
    ref="root"
    class="acu-md"
    v-html="html"
    @click="onCodeCopyClick"
    @mouseover="onThinkingOver"
    @mouseout="onThinkingOut"
  ></div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useMarkdown, isShikiReady } from '@/composables/useMarkdown'

const props = defineProps<{
  /** Markdown 源文本 */
  source: string
}>()

const { render } = useMarkdown()
const html = ref('')
const root = ref<HTMLElement | null>(null)

let rafId = 0

function scheduleRender() {
  cancelAnimationFrame(rafId)
  // 用 rAF 节流：流式高频追加时，每帧最多渲染一次
  rafId = requestAnimationFrame(() => {
    html.value = render(props.source)
  })
}

watch(
  () => props.source,
  scheduleRender,
  { immediate: true }
)
// Shiki 就绪后重新渲染（让降级的代码块获得高亮）
watch(isShikiReady, (ready) => {
  if (ready) scheduleRender()
})

onBeforeUnmount(() => cancelAnimationFrame(rafId))

// —— 思考块滚动条的悬停显现 —— //
// v-html 里的 <think> 块没有 Vue 生命周期，挂不上 @mouseenter，只能委托。
// （ThinkingBlock 那一路是自己管的，这里只管正文里内联的 <think>。）
//
// 为什么要 JS 而不是 CSS :hover：Blink 不会因祖先伪类状态变化去重算
// 滚动条伪元素的样式，:hover 写法（连 !important）实测完全不生效，
// class 驱动才有效。详见 base.scss 里 `.acu-thinking-body.is-scrollbar-hover` 的注释。
function thinkingBodyOf(e: Event): HTMLElement | null {
  const t = e.target
  if (!(t instanceof Element)) return null
  return t.closest<HTMLElement>('.acu-thinking-body.is-scrollbar-hover')
}

function onThinkingOver(e: Event) {
  thinkingBodyOf(e)?.classList.add('is-scrollbar-visible')
}

function onThinkingOut(e: Event) {
  const body = thinkingBodyOf(e)
  if (!body) return
  // 还在同一个思考块内部挪动时不要撤掉，否则滚动条会跟着鼠标闪
  const to = (e as MouseEvent).relatedTarget
  if (to instanceof Node && body.contains(to)) return
  body.classList.remove('is-scrollbar-visible')
}

// 代码块复制：事件委托
function onCodeCopyClick(e: MouseEvent) {
  const target = (e.target as HTMLElement).closest(
    '.acu-code-copy'
  ) as HTMLElement | null
  if (!target) return
  const encoded = target.getAttribute('data-code') || ''
  const code = decodeURIComponent(encoded)
  const label = target.querySelector('.acu-code-copy-label')
  const write =
    navigator.clipboard?.writeText(code) ??
    Promise.reject(new Error('clipboard unavailable'))
  write
    .then(() => {
      target.classList.add('is-copied')
      if (label) label.textContent = '已复制'
      setTimeout(() => {
        target.classList.remove('is-copied')
        if (label) label.textContent = '复制'
      }, 1500)
    })
    .catch(() => {
      target.classList.add('is-error')
      if (label) label.textContent = '失败'
      setTimeout(() => {
        target.classList.remove('is-error')
        if (label) label.textContent = '复制'
      }, 1500)
    })
}
</script>

<style lang="scss">
// 非 scoped：v-html 内容需要被命中；用 .acu-md 前缀做作用域隔离
.acu-md {
  font-size: var(--acu-font-size-md);
  line-height: var(--acu-line-height);
  color: var(--acu-bubble-assistant-text);
  word-wrap: break-word;
  overflow-wrap: anywhere;

  > *:first-child {
    margin-top: 0;
  }
  > *:last-child {
    margin-bottom: 0;
  }

  p {
    margin: 0 0 var(--acu-space-3);
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin: var(--acu-space-6) 0 var(--acu-space-3);
    font-weight: 650;
    line-height: 1.3;
  }
  h1 {
    font-size: 1.5em;
  }
  h2 {
    font-size: 1.32em;
  }
  h3 {
    font-size: 1.18em;
  }
  h4 {
    font-size: 1.06em;
  }

  ul,
  ol {
    margin: 0 0 var(--acu-space-3);
    padding-left: 1.5em;
  }
  li {
    margin: var(--acu-space-1) 0;
  }
  li::marker {
    color: var(--acu-text-muted);
  }
  ul ul,
  ol ol,
  ul ol,
  ol ul {
    margin: var(--acu-space-1) 0;
  }

  // 任务列表（- [ ] / - [x]）
  li.task-list-item {
    list-style: none;
    margin-left: -1.4em;
  }

  a {
    color: var(--acu-primary);
    text-decoration: none;
    border-bottom: 1px solid var(--acu-primary-soft);
    transition: border-color var(--acu-duration) var(--acu-easing);
    &:hover {
      border-bottom-color: var(--acu-primary);
    }
  }

  strong {
    font-weight: 650;
  }
  em {
    font-style: italic;
  }
  del {
    color: var(--acu-text-muted);
  }

  hr {
    margin: var(--acu-space-5) 0;
    border: none;
    border-top: 1px solid var(--acu-border);
  }

  blockquote {
    margin: 0 0 var(--acu-space-3);
    padding: var(--acu-space-1) var(--acu-space-4);
    border-left: 3px solid var(--acu-primary);
    background: var(--acu-primary-soft);
    border-radius: 0 var(--acu-radius-sm) var(--acu-radius-sm) 0;
    color: var(--acu-text-secondary);
    > *:last-child {
      margin-bottom: 0;
    }
  }

  // 行内代码
  code:not(pre code) {
    padding: 0.15em 0.4em;
    margin: 0 0.1em;
    font-family: var(--acu-font-mono);
    font-size: 0.88em;
    background: var(--acu-code-inline-bg);
    color: var(--acu-text);
    border-radius: var(--acu-radius-xs);
  }

  // 表格
  table {
    width: 100%;
    margin: 0 0 var(--acu-space-3);
    border-collapse: collapse;
    font-size: 0.95em;
    overflow: hidden;
    border-radius: var(--acu-radius-sm);
    display: block;
    overflow-x: auto;
    @include acu-scrollbar;
  }
  th,
  td {
    padding: var(--acu-space-2) var(--acu-space-3);
    border: 1px solid var(--acu-border);
    text-align: left;
  }
  th {
    background: var(--acu-surface);
    font-weight: 600;
  }
  tbody tr:nth-child(2n) {
    background: var(--acu-surface);
  }

  img.acu-md-img {
    max-width: 100%;
    border-radius: var(--acu-radius-sm);
    vertical-align: middle;
  }

  // —— 代码块（带 header + 复制按钮） ——
  .acu-code-block {
    margin: 0 0 var(--acu-space-3);
    border: 1px solid var(--acu-code-border);
    border-radius: var(--acu-radius);
    overflow: hidden;
    background: var(--acu-code-bg);
  }
  .acu-code-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--acu-space-3);
    height: 34px;
    background: var(--acu-code-header-bg);
    border-bottom: 1px solid var(--acu-code-border);
  }
  .acu-code-lang {
    font-family: var(--acu-font-mono);
    font-size: var(--acu-font-size-xs);
    color: var(--acu-text-muted);
    text-transform: lowercase;
    letter-spacing: 0.02em;
  }
  .acu-code-copy {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border: none;
    background: transparent;
    color: var(--acu-text-muted);
    font-size: var(--acu-font-size-xs);
    font-family: inherit;
    border-radius: var(--acu-radius-xs);
    cursor: pointer;
    transition: all var(--acu-duration-fast) var(--acu-easing);
    svg {
      display: block;
    }
    &:hover {
      background: var(--acu-surface-2);
      color: var(--acu-text);
    }
    &.is-copied {
      color: var(--acu-success);
    }
    &.is-error {
      color: var(--acu-error);
    }
  }

  // Shiki 输出的 pre
  .shiki {
    margin: 0;
    padding: var(--acu-space-4);
    background: var(--acu-code-bg) !important;
    font-family: var(--acu-font-mono);
    font-size: var(--acu-font-size-sm);
    line-height: 1.6;
    overflow-x: auto;
    @include acu-scrollbar(8px);
    code {
      font-family: inherit;
      background: none;
      padding: 0;
    }
  }

  // Shiki 双主题：light 默认，dark 由 [data-theme] 切换
  .shiki,
  .shiki span {
    color: var(--shiki-light, inherit);
    font-style: var(--shiki-light-font-style, normal);
    font-weight: var(--shiki-light-font-weight, normal);
    text-decoration: var(--shiki-light-text-decoration, none);
  }
  [data-theme='dark'] & {
    .shiki,
    .shiki span {
      color: var(--shiki-dark, inherit);
      font-style: var(--shiki-dark-font-style, normal);
      font-weight: var(--shiki-dark-font-weight, normal);
      text-decoration: var(--shiki-dark-text-decoration, none);
    }
  }
  // 降级代码块（无高亮）
  .acu-code-fallback {
    color: var(--acu-code-text);
  }
}
</style>
