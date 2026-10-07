<template>
  <!--
    Markdown 渲染容器。
    - v-html 输出 markdown-it 解析结果（已禁原始 HTML，安全）
    - 事件委托处理代码块复制按钮 / 图表「源码」切换 / 图表「放大」
    - 样式为非 scoped（带 .acu-md 前缀隔离），因 v-html 内容无法被 scoped 命中
    - inheritAttrs: false + v-bind="$attrs"：查看器是第二个根节点（Teleport 到 body），
      多根组件不再自动承接 attrs，得手动把宿主传的 class/style 绑回 .acu-md 上 ——
      不然宿主那层 class（如 JobLogDetails 的 .wb-log-fullscreen__render）会落到空处
  -->
  <div
    ref="root"
    class="acu-md"
    v-bind="$attrs"
    v-html="html"
    @click="onClick"
    @mouseover="onThinkingOver"
    @mouseout="onThinkingOut"
  ></div>

  <!-- 图表全屏查看器：Teleport 到 body，不占正文布局 -->
  <MermaidPreview
    v-model:visible="previewVisible"
    :svg="previewSvg"
    :theme="previewTheme"
    :labels="zoomLabels"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useMarkdown, isShikiReady } from '@/composables/useMarkdown'
import {
  mermaidLabels,
  mermaidPreviewSvg,
  observeMermaidTheme,
  renderMermaidBlocks,
  toggleMermaidSource
} from '@/composables/useMermaid'
import MermaidPreview from '@/components/MermaidPreview/MermaidPreview.vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    /** Markdown 源文本 */
    source: string
    /**
     * 正文是否仍在流式输出。
     *
     * 只影响 ```mermaid 图表：流式期间挂占位态不画图（half-baked 的源码要么报错、
     * 要么画出一张错的图），等翻回 false 再一次性画出来。宿主不传也不会坏，
     * 只是图表会在每次增量后重试渲染。
     * @default false
     */
    streaming?: boolean
  }>(),
  { streaming: false }
)

const { render } = useMarkdown()
const html = ref('')
const root = ref<HTMLElement | null>(null)

let rafId = 0
let hydrateTimer = 0

/**
 * 图表补渲染的合并延迟。
 *
 * 正文在流式期间每帧都会重建，图表块跟着一起重建；不合并的话每个新出现的块都会
 * 立刻发起一次 mermaid 渲染。120ms 足以把同一批 DOM 变化并成一次，肉眼无感。
 */
const HYDRATE_DELAY = 120

function hydrate() {
  renderMermaidBlocks(root.value, { streaming: props.streaming })
}

function scheduleHydrate(delay = HYDRATE_DELAY) {
  window.clearTimeout(hydrateTimer)
  hydrateTimer = window.setTimeout(() => {
    hydrateTimer = 0
    hydrate()
  }, delay)
}

function scheduleRender() {
  cancelAnimationFrame(rafId)
  // 用 rAF 节流：流式高频追加时，每帧最多渲染一次
  rafId = requestAnimationFrame(() => {
    html.value = render(props.source)
    // v-html 的内容要等本次 patch 完才进 DOM，nextTick 之后再去找图表块
    nextTick(() => scheduleHydrate())
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
// 流式结束 → 把期间搁置的图表画出来
watch(
  () => props.streaming,
  (streaming) => {
    if (!streaming) scheduleHydrate(0)
  }
)

// 图表 SVG 的配色是烘进 SVG 的（不像正文那样走 CSS 变量），换主题要重画一遍；
// 缓存按主题分键，来回切只会各画一次
let stopThemeObserver: (() => void) | null = null
onMounted(() => {
  stopThemeObserver = observeMermaidTheme(root.value, () => {
    scheduleHydrate(0)
  })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.clearTimeout(hydrateTimer)
  stopThemeObserver?.()
})

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

// 复制 / 图表视图切换 / 图表放大：都是 v-html 里的按钮，只能走事件委托
function onClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (!target) return

  const toggle = target.closest('.acu-mermaid-toggle')
  if (toggle) {
    toggleMermaidSource(toggle.closest<HTMLElement>('.acu-mermaid'))
    return
  }

  const zoomBtn = target.closest('.acu-mermaid-zoom')
  if (zoomBtn) {
    openMermaidPreview(zoomBtn.closest<HTMLElement>('.acu-mermaid'))
    return
  }

  // 直接点图也能打开（用户不会先去头里找按钮）。
  // 两个例外：图里的链接交给它自己；正在选字时那一下 click 不算「点开」。
  const canvas = target.closest('.acu-mermaid-canvas')
  if (canvas && !target.closest('a')) {
    const selection = window.getSelection?.()
    if (selection && !selection.isCollapsed) return
    const block = canvas.closest<HTMLElement>('.acu-mermaid')
    if (block?.dataset.state === 'done') {
      openMermaidPreview(block)
      return
    }
  }

  onCodeCopyClick(target)
}

// —— 图表全屏查看器 —— //
const previewVisible = ref(false)
const previewSvg = ref('')
const previewTheme = ref<'light' | 'dark'>('light')
// 文案在渲染时读（与 fence 生成占位块同一口径），宿主改配置后重新渲染正文才生效
const zoomLabels = computed(() => mermaidLabels())

function openMermaidPreview(block: HTMLElement | null): void {
  if (!block) return
  const canvas = block.querySelector<HTMLElement>('.acu-mermaid-canvas')
  const html = mermaidPreviewSvg(canvas)
  if (!html) return
  previewSvg.value = html
  // 「纸」的底色跟着图表自己的主题走（浅色图不该糊在深色遮罩里）
  previewTheme.value = block.dataset.mermaidTheme === 'dark' ? 'dark' : 'light'
  previewVisible.value = true
}

// 代码块复制：事件委托
function onCodeCopyClick(target: HTMLElement) {
  const btn = target.closest('.acu-code-copy') as HTMLElement | null
  if (!btn) return
  const encoded = btn.getAttribute('data-code') || ''
  const code = decodeURIComponent(encoded)
  const label = btn.querySelector('.acu-code-copy-label')
  const write =
    navigator.clipboard?.writeText(code) ??
    Promise.reject(new Error('clipboard unavailable'))
  write
    .then(() => {
      btn.classList.add('is-copied')
      if (label) label.textContent = '已复制'
      setTimeout(() => {
        btn.classList.remove('is-copied')
        if (label) label.textContent = '复制'
      }, 1500)
    })
    .catch(() => {
      btn.classList.add('is-error')
      if (label) label.textContent = '失败'
      setTimeout(() => {
        btn.classList.remove('is-error')
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
    // 抑制中文长段落最后一行只剩一两个字的「孤字」。
    // Chromium 117+ / Safari 17.4+ 支持，其余引擎直接忽略 —— 纯渐进增强，无降级代价。
    text-wrap: pretty;
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
    // 标题两行时按长度均分，避免「第一行塞满、第二行两个字」
    text-wrap: balance;
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
    text-wrap: pretty;
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
    // 原来是 3px 主色左边条 + 单侧圆角。粗色条是引述块最常见的模板化写法，
    // 换成整块淡底 + 四角同圆角：一样一眼认得出是引用，但不再是贴上去的一条色带。
    padding: var(--acu-space-3) var(--acu-space-4);
    background: var(--acu-primary-soft);
    border-radius: var(--acu-radius);
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
  // ⚠️ 这里不能用 display:block 换横向滚动：display:block 会把表格内部的网格降级成
  // shrink-to-fit，表格只占内容列一半宽，与上下段落左边缘对不齐（实测 Chrome 153）。
  // 所以保持 display:table + width:100%，靠单元格 overflow-wrap:anywhere 让长 token
  // 自己换行 —— 表格因此永远不会顶破内容列，也就不需要横向滚动。
  table {
    width: 100%;
    margin: 0 0 var(--acu-space-3);
    border-collapse: collapse;
    font-size: 0.95em;
  }
  th,
  td {
    padding: var(--acu-space-2) var(--acu-space-3);
    // 只留横向分隔线。原来「整格网格 + 斑马纹」是三重编码同一件事（这是另一个格子），
    // 减到一条线后表格立刻透气，也从「Excel 截图」变回排版。
    border-bottom: 1px solid var(--acu-border);
    text-align: left;
    // anywhere 而不是 break-word：它会参与 min-content 计算，单元格因此能被压到
    // 最小，表格在任何内容下都放得进内容列
    overflow-wrap: anywhere;
  }
  th {
    background: var(--acu-surface);
    font-weight: 600;
    border-bottom-color: var(--acu-border-strong);
  }
  tbody tr:last-child td {
    border-bottom: none;
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
    padding: var(--acu-space-1) var(--acu-space-2);
    border: none;
    background: transparent;
    color: var(--acu-text-muted);
    font-size: var(--acu-font-size-xs);
    font-family: inherit;
    border-radius: var(--acu-radius-xs);
    cursor: pointer;
    transition: background-color var(--acu-duration-fast) var(--acu-easing),
      color var(--acu-duration-fast) var(--acu-easing);
    svg {
      display: block;
    }
    &:hover {
      background: var(--acu-surface-2);
      color: var(--acu-text);
    }
    &:active {
      background: var(--acu-surface-hover);
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

  // —— 图表块（```mermaid） ——
  //
  // 刻意和代码块共用一套骨架（34px 头 + 发丝边 + 12px 圆角）：模型经常一条消息里
  // 又给图又给码，两者上下相邻时应该看起来是一家人，而不是「图是图、码是码」。
  //
  // 显隐由两个 data 属性决定，都在 fence 输出的 HTML 上，由 useMermaid 的补渲染
  // 直接改 dataset（不经过 Vue，加不了 class）：
  //   data-state：pending / streaming / rendering（占位）· done（画好了）· error（降级源码）
  //   data-view ：chart（图）· source（源码，用户点的或失败降级）
  .acu-mermaid {
    margin: 0 0 var(--acu-space-3);
    border: 1px solid var(--acu-border);
    border-radius: var(--acu-radius);
    background: var(--acu-card-bg);
    overflow: hidden;
  }

  .acu-mermaid-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--acu-space-2);
    height: 34px;
    padding: 0 var(--acu-space-3);
    background: var(--acu-code-header-bg);
    border-bottom: 1px solid var(--acu-border);
  }

  .acu-mermaid-type {
    font-size: var(--acu-font-size-xs);
    color: var(--acu-text-muted);
    letter-spacing: 0.02em;
  }

  .acu-mermaid-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--acu-space-1);
  }

  // 和 .acu-code-copy 同一档按钮（后者样式在下面，图表头里复用同一个类）
  .acu-mermaid-toggle,
  .acu-mermaid-zoom {
    display: inline-flex;
    align-items: center;
    padding: var(--acu-space-1) var(--acu-space-2);
    border: none;
    background: transparent;
    color: var(--acu-text-muted);
    font-size: var(--acu-font-size-xs);
    font-family: inherit;
    border-radius: var(--acu-radius-xs);
    cursor: pointer;
    transition: background-color var(--acu-duration-fast) var(--acu-easing),
      color var(--acu-duration-fast) var(--acu-easing);

    &:hover {
      background: var(--acu-surface-2);
      color: var(--acu-text);
    }
    &:active {
      background: var(--acu-surface-hover);
    }
  }

  .acu-mermaid-hint {
    display: none;
    align-items: center;
    gap: var(--acu-space-2);
    padding: var(--acu-space-4);
    color: var(--acu-text-muted);
    font-size: var(--acu-font-size-sm);
  }

  .acu-mermaid-canvas {
    display: none;
    position: relative;
    padding: var(--acu-space-4);
    overflow-x: auto;
    @include acu-scrollbar(8px);

    svg {
      display: block;
      margin: 0 auto;
      // ⚠️ 这里**不要**给 svg 加 max-width / width / height。
      // mermaid 自己已经把尺寸写进行内：`width="100%"` + `style="max-width: Npx"`
      // （N 是这张图的自然宽度）+ `viewBox`。三者配合的效果正好是「比内容列窄就
      // 原尺寸居中、比内容列宽才等比缩小」。
      // 实测（Chromium）：一旦用 max-width: 100% !important 压掉那个 N，
      // 窄图会被拉满内容列 —— 232px 宽的流程图被放大 2.8 倍，字比正文还大。
      //
      // 缩小有下限（见 useMermaid 的 fitMermaidCanvas）：容器窄到会跌破 0.8 倍时，
      // 由 JS 把 svg 改回自然宽度、交给这里的 overflow-x 横滚，不再把字压成 4~5px。
    }
  }

  // 可点开全屏查看器（图已画好、且不在源码视图）：给个能看出「这里能点」的指针
  .acu-mermaid[data-state='done'][data-view='chart'] .acu-mermaid-canvas {
    cursor: zoom-in;
  }

  /*
    宽图落进窄容器、改为横向滚动时，右边缘给一道渐隐：外面还有内容。
    挂在**块**上、盖在画布右缘（画布自己滚动，伪元素跟着滚，钉不住）。
    高度从标题栏下沿（34px）到底：done + chart 时画布独占剩下的高度。
  */
  .acu-mermaid[data-state='done'][data-view='chart']:has(.acu-mermaid-canvas.is-scrolled) {
    position: relative;
  }
  .acu-mermaid[data-state='done'][data-view='chart']:has(.acu-mermaid-canvas.is-scrolled)::after {
    content: '';
    position: absolute;
    top: 34px;
    right: 0;
    bottom: 0;
    width: 24px;
    border-bottom-right-radius: var(--acu-radius);
    pointer-events: none;
    background: linear-gradient(to right, transparent, var(--acu-card-bg, #fff));
  }

  .acu-mermaid-source {
    display: none;
    margin: 0;
    padding: var(--acu-space-4);
    background: var(--acu-code-bg);
    color: var(--acu-code-text);
    font-family: var(--acu-font-mono);
    font-size: var(--acu-font-size-sm);
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-x: auto;
    @include acu-scrollbar(8px);

    code {
      font-family: inherit;
      background: none;
      padding: 0;
    }
  }

  // 占位态：只有一句「正在生成图表…」，画布和源码都不露
  .acu-mermaid[data-state='pending'],
  .acu-mermaid[data-state='streaming'],
  .acu-mermaid[data-state='rendering'] {
    .acu-mermaid-hint {
      display: flex;
    }
  }

  .acu-mermaid[data-state='done'] .acu-mermaid-canvas {
    display: block;
  }

  // 渲染失败：源码顶上（data-view 被补渲染改成 source），上面留一句说明
  .acu-mermaid[data-state='error'] {
    .acu-mermaid-hint {
      display: flex;
      // 失败不是「进行中」，三点动画在这个状态里是错的信号
      .acu-typing-dots {
        display: none;
      }
    }
  }

  // 视图切换：源码视图顶掉画布
  .acu-mermaid[data-view='source'] {
    .acu-mermaid-canvas {
      display: none;
    }
    .acu-mermaid-source {
      display: block;
    }
  }

  // 还没画出图（或压根没图）时没有源码可切、也没有图可放大，两个按钮都藏掉，只留复制
  .acu-mermaid[data-state='pending'] .acu-mermaid-toggle,
  .acu-mermaid[data-state='pending'] .acu-mermaid-zoom,
  .acu-mermaid[data-state='streaming'] .acu-mermaid-toggle,
  .acu-mermaid[data-state='streaming'] .acu-mermaid-zoom,
  .acu-mermaid[data-state='rendering'] .acu-mermaid-toggle,
  .acu-mermaid[data-state='rendering'] .acu-mermaid-zoom {
    display: none;
  }

  // 源码视图里没有「图」可放大
  .acu-mermaid[data-view='source'] .acu-mermaid-zoom {
    display: none;
  }
}
</style>
