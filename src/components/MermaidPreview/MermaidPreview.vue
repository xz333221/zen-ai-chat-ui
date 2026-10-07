<template>
  <!--
    图表全屏查看器（点图表头「放大」或直接点图打开）。

    为什么需要它：正文里的图表必须照顾版面，比容器宽的图只能整张等比缩小 ——
    420px 的面板里一张 993px 宽的流程图会被压到 0.39 倍，14px 的正文字等效只剩 5.5px。
    「缩放下限」保证字不会再被压到读不动（改用横向滚动），这个查看器则负责
    「一眼看清整张图」：默认按 100% 原始尺寸显示（装不下才缩到适应），滚轮缩放、
    拖动平移、双击复位。

    Teleport 到 body：图表常常处在 overflow:hidden 的窄容器里，留在原地会被裁掉。
    配色沿用 ImagePreview 那套约定 —— 深色遮罩 + 定义在裸 :root 的 --acu-overlay-*，
    不跟 [data-theme] 走（Teleport 之后脱离 .acu-root 作用域，只吃得到 :root 上的变量）。
    图本身画在「纸」上（:data-theme 跟随图表自己的主题），浅色图不会糊在深色遮罩里。
  -->
  <Teleport v-if="visible" to="body">
    <div
      class="acu-mz"
      role="dialog"
      aria-modal="true"
      :aria-label="labels.zoom || '图表预览'"
      @click.self="close"
    >
      <div
        ref="viewportRef"
        class="acu-mz-viewport"
        :class="{ 'is-dragging': dragging }"
        @wheel.prevent="onWheel"
        @pointerdown="onDragStart"
        @dblclick="reset"
        @click="onViewportClick"
      >
        <div
          ref="stageRef"
          class="acu-mz-stage"
          :data-theme="theme"
          :data-scale="scale.toFixed(3)"
          :style="stageStyle"
          v-html="svg"
        ></div>
      </div>

      <button
        type="button"
        class="acu-mz-btn is-close"
        :aria-label="labels.close"
        :title="labels.close"
        @click="close"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div class="acu-mz-bar">
        <button
          type="button"
          class="acu-mz-btn is-step"
          :aria-label="labels.zoomOut"
          :title="labels.zoomOut"
          @click="zoomBy(1 / 1.3)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          type="button"
          class="acu-mz-btn is-fit"
          :title="labels.zoomReset"
          @click="reset"
        >
          {{ labels.zoomReset }}<span class="acu-mz-pct">{{ percent }}%</span>
        </button>
        <button
          type="button"
          class="acu-mz-btn is-step"
          :aria-label="labels.zoomIn"
          :title="labels.zoomIn"
          @click="zoomBy(1.3)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <p class="acu-mz-hint">{{ labels.zoomHint }}</p>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import type { MermaidLabels } from '@/types'

const props = withDefaults(
  defineProps<{
    /** v-model:visible */
    visible?: boolean
    /** 已完成渲染的 SVG 标记（见 useMermaid 的 mermaidPreviewSvg：id 已改名、尺寸是自然宽高） */
    svg: string
    /** 图表自己的主题：决定这块「纸」的底色，别让浅色图糊在深色遮罩上 */
    theme?: 'light' | 'dark'
    /** 文案（同 MermaidLabels，宿主可覆盖） */
    labels?: Required<MermaidLabels>
  }>(),
  {
    visible: false,
    theme: 'light',
    labels: () => ({}) as Required<MermaidLabels>
  }
)

const emit = defineEmits<{ (e: 'update:visible', value: boolean): void }>()

const MIN_SCALE = 0.2
const MAX_SCALE = 6

const viewportRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const scale = ref(1)
const pan = reactive({ x: 0, y: 0 })
const dragging = ref(false)
let dragStart = { x: 0, y: 0, px: 0, py: 0 }
/** 这一把指针到底有没有拖动过（区分「点空白关闭」与「拖完松手」） */
let dragMoved = false

const percent = computed(() => Math.round(scale.value * 100))

const stageStyle = computed(() => ({
  transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${scale.value})`
}))

function clamp(v: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, v))
}

/**
 * 「适应窗口」的倍数：装不下才缩（不放大）—— 小图保持 100%，
 * 大图缩到刚好放得下（上下左右各留 24px）。
 */
function fitScale(): number {
  const stage = stageRef.value
  const viewport = viewportRef.value
  if (!stage || !viewport) return 1
  const w = stage.offsetWidth
  const h = stage.offsetHeight
  if (!w || !h) return 1
  const k = Math.min((viewport.clientWidth - 48) / w, (viewport.clientHeight - 96) / h)
  return clamp(Math.min(1, k))
}

/** 打开时先铺满：装不下才缩到适应，装得下就 100%（正文里多半已经被缩得很小了，进来不能再小） */
function reset() {
  scale.value = 1
  pan.x = 0
  pan.y = 0
  const fit = fitScale()
  if (fit < 1) scale.value = fit
}

/** 以视口中心为锚点缩放（按钮走这条；滚轮那条锚在光标上，见 onWheel） */
function zoomBy(factor: number) {
  scale.value = clamp(scale.value * factor)
}

function onWheel(e: WheelEvent) {
  const viewport = viewportRef.value
  if (!viewport) return
  const prev = scale.value
  const next = clamp(prev * (e.deltaY < 0 ? 1.12 : 1 / 1.12))
  if (next === prev) return
  // 锚在光标：让光标下那一点在缩放前后停在原地（不然放大时目标会滑走）
  const rect = viewport.getBoundingClientRect()
  const vx = e.clientX - (rect.left + rect.width / 2)
  const vy = e.clientY - (rect.top + rect.height / 2)
  const k = next / prev
  pan.x = vx - k * (vx - pan.x)
  pan.y = vy - k * (vy - pan.y)
  scale.value = next
}

function onDragStart(e: PointerEvent) {
  // 只认左键 / 主指针；按钮在遮罩另一层，够不到这里
  if (e.button !== 0) return
  dragging.value = true
  dragMoved = false
  dragStart = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
  // ⚠️ 监听挂在 window 上，**不要**用 viewport.setPointerCapture()：
  // 捕获会把 pointerup 重定向到 viewport，紧随其后的 click 也跟着改派到 viewport ——
  // 于是「在图中间点一下」会被判成「点空白处」，一碰就关（实测踩过）。
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

function onDragMove(e: PointerEvent) {
  if (!dragging.value) return
  const dx = e.clientX - dragStart.x
  const dy = e.clientY - dragStart.y
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true
  pan.x = dragStart.px + dx
  pan.y = dragStart.py + dy
}

/**
 * 点空白处关闭。
 *
 * 为什么不是简单的 `@click.self`：铺满全屏的是 .acu-mz-viewport（层级在遮罩之上），
 * 点"背景"时事件目标是它而不是最外层，`self` 永远不成立。
 * 另外拖拽结束也可能补一个 click —— 拖过（>3px）的那一下不算"点空白"，
 * 否则平移完松手就把查看器关了。
 */
function onViewportClick(e: MouseEvent) {
  if (dragMoved) {
    dragMoved = false
    return
  }
  if (e.target === e.currentTarget) close()
}

function onDragEnd() {
  dragging.value = false
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
}

function close() {
  emit('update:visible', false)
}

// Esc 关闭：捕获阶段拦下来，别让宿主的 Esc 处理器（弹窗、抽屉）跟着一起关
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  close()
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      window.addEventListener('keydown', onKeydown, true)
      // 等 v-html 的 SVG 进 DOM 才量得到尺寸
      nextTick(() => reset())
    } else {
      window.removeEventListener('keydown', onKeydown, true)
      // 拖到一半被关掉（Esc）也要把 window 上的监听摘干净
      onDragEnd()
      dragging.value = false
      pan.x = 0
      pan.y = 0
      scale.value = 1
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<style lang="scss" scoped>
.acu-mz {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--acu-overlay-scrim, rgba(9, 9, 11, 0.88));
  animation: acu-mz-in var(--acu-duration-fast, 0.12s) ease;
}

.acu-mz-viewport {
  position: absolute;
  inset: 0;
  overflow: hidden;
  cursor: grab;
  touch-action: none;

  &.is-dragging {
    cursor: grabbing;
  }
}

/*
  「纸」：图表画在自己的主题底上（浅色图不至于糊在深色遮罩里），
  transform 由 JS 驱动（translate 居中 → 平移 → 缩放，origin 默认中心）。
*/
.acu-mz-stage {
  position: absolute;
  left: 50%;
  top: 50%;
  width: fit-content;
  padding: var(--acu-space-4, 16px);
  border-radius: var(--acu-radius, 12px);
  background: var(--acu-card-bg, #ffffff);
  box-shadow: var(--acu-overlay-shadow, 0 18px 60px rgba(0, 0, 0, 0.55));

  :deep(svg) {
    display: block;
  }
}

.acu-mz-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: var(--acu-radius-full, 999px);
  background: var(--acu-overlay-surface, rgba(255, 255, 255, 0.12));
  color: var(--acu-overlay-text, #fafafa);
  font-family: inherit;
  cursor: pointer;
  transition: background var(--acu-duration-fast, 0.12s) ease;

  &:hover {
    background: var(--acu-overlay-surface-hover, rgba(255, 255, 255, 0.24));
  }

  &:focus-visible {
    outline: 2px solid var(--acu-overlay-ring, rgba(255, 255, 255, 0.7));
    outline-offset: 2px;
  }

  &.is-close {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 36px;
    height: 36px;
  }

  &.is-step {
    width: 36px;
    height: 36px;
  }

  &.is-fit {
    height: 36px;
    padding: 0 var(--acu-space-3, 12px);
    gap: var(--acu-space-2, 8px);
    font-size: var(--acu-font-size-xs, 12px);
  }
}

/* 底部悬浮工具条：缩略信息与操作都收在这一条里，别在图上再压别的东西 */
.acu-mz-bar {
  position: absolute;
  left: 50%;
  bottom: 52px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--acu-space-2, 8px);
  padding: var(--acu-space-1, 4px);
  border-radius: var(--acu-radius-full, 999px);
  background: rgba(24, 24, 27, 0.6);
  backdrop-filter: blur(6px);
}

.acu-mz-pct {
  min-width: 40px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--acu-overlay-text-muted, rgba(255, 255, 255, 0.72));
}

.acu-mz-hint {
  position: absolute;
  left: 50%;
  bottom: 20px;
  margin: 0;
  transform: translateX(-50%);
  color: var(--acu-overlay-text-muted, rgba(255, 255, 255, 0.72));
  font-size: var(--acu-font-size-xs, 12px);
  white-space: nowrap;
  pointer-events: none;
}

@keyframes acu-mz-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .acu-mz {
    animation: none;
  }
}
</style>
