<template>
  <!--
    思考（reasoning）内容块。
    - streaming：默认展开，标题显示"思考中"+三点动画，正文带流式光标
    - done：可折叠，标题显示"思考"，默认折叠
    - 样式区别于正式回答：弱化配色、左侧细线、更小字号
    - 正文超出高度上限时内部滚动（见 ThinkingConfig），避免长思考把气泡撑得过高
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
        {{ streaming ? '思考中' : '思考' }}
      </span>

      <!-- 思考段耗时：折叠着也看得见「它想了多久」，这正是这个数字的用处 -->
      <span v-if="durationText" class="acu-thinking-duration" :title="durationTitle">
        {{ durationText }}
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
      <div
        v-show="expanded"
        ref="bodyRef"
        class="acu-thinking-body"
        :class="[
          { 'is-scrollable': scrollable },
          scrollable ? `is-scrollbar-${scrollbarMode}` : '',
          { 'is-scrollbar-visible': showScrollbar }
        ]"
        :style="bodyStyle"
        @scroll.passive="onScroll"
        @mouseenter="onBodyEnter"
        @mouseleave="onBodyLeave"
      >
        <MarkdownRenderer :source="content" :streaming="!!streaming" />
        <span v-if="streaming && content" class="acu-cursor" aria-hidden="true"></span>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ThinkingConfig } from '@/types'
import { formatDuration } from '@/utils/format'
import MarkdownRenderer from '@/components/MarkdownRenderer/MarkdownRenderer.vue'

const props = withDefaults(
  defineProps<{
    /** 思考内容（Markdown） */
    content: string
    /** 是否仍在流式输出 */
    streaming?: boolean
    /** 初始是否展开 */
    defaultExpanded?: boolean
    /** 展示配置（高度上限 / 滚动 / 流式跟随 / 耗时） */
    config?: ThinkingConfig
    /**
     * 思考段耗时（毫秒）。显式值优先——历史记录里就靠它，
     * 时间戳没被存下来时它是唯一的来源
     */
    durationMs?: number
    /** 思考开始时间戳。不传 durationMs 时用它推导，流式期间还能实时跳动 */
    startedAt?: number
    /** 思考结束时间戳（不再流式时用它定格） */
    endedAt?: number
  }>(),
  {
    content: '',
    streaming: false,
    defaultExpanded: undefined,
    config: undefined,
    durationMs: undefined,
    startedAt: undefined,
    endedAt: undefined
  }
)

const scrollable = computed(() => props.config?.scrollable !== false)
const followStream = computed(() => props.config?.followStream !== false)
// 默认 hover：静止时不显示滚动条，鼠标移入正文才淡入
const scrollbarMode = computed(() => props.config?.scrollbar ?? 'hover')

// Blink 不认 `:hover` 驱动滚动条伪元素（详见 base.scss 里的说明），只能自己切类。
// 用 mouseenter/mouseleave 而不是 mouseover/mouseout：这对事件不冒泡，
// 鼠标在正文内部移动不会反复触发。
const scrollbarHovering = ref(false)
const showScrollbar = computed(() => scrollable.value && scrollbarMode.value === 'hover' && scrollbarHovering.value)

function onBodyEnter() {
  scrollbarHovering.value = true
}
function onBodyLeave() {
  scrollbarHovering.value = false
}

// 高度上限走 CSS 变量，这样既能被 base.scss 的共享样式消费，
// 又不用为每个实例生成一条独立规则
const bodyStyle = computed(() =>
  props.config?.maxHeight
    ? ({ '--acu-thinking-max-height': `${props.config.maxHeight}px` } as Record<string, string>)
    : undefined
)

// —— 思考段耗时 ——
// 取值优先级：显式 durationMs > 时间戳推导 > （流式期间）实时跳动。
// 和 MessageMeta 里那套耗时逻辑同构，省得两处对「有值 / 没值」的判定长得不一样。
const showDuration = computed(() => props.config?.showDuration !== false)

const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null

function stopTicker() {
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
}

/** 只有「正在思考 + 有起点 + 没有现成数字」才需要开定时器 —— 历史消息一个都不开 */
const ticking = computed(
  () =>
    showDuration.value &&
    props.streaming &&
    typeof props.durationMs !== 'number' &&
    typeof props.startedAt === 'number'
)

watch(
  ticking,
  (on) => {
    stopTicker()
    if (!on) return
    now.value = Date.now()
    ticker = setInterval(() => {
      now.value = Date.now()
    }, 100)
  },
  { immediate: true }
)

onBeforeUnmount(stopTicker)

const durationMs = computed(() => {
  if (!showDuration.value) return null
  if (typeof props.durationMs === 'number') return props.durationMs

  const start = props.startedAt
  if (typeof start !== 'number') return null
  if (props.streaming) return now.value - start

  const end = props.endedAt
  return typeof end === 'number' && end > start ? end - start : null
})

const durationText = computed(() => {
  const ms = durationMs.value
  // 0ms 说明思考只来了一个分片、瞬间就结束了 —— 这个数字没有信息量，
  // 显示它只会让人以为统计坏了
  return ms === null || ms <= 0 ? '' : formatDuration(ms)
})

const durationTitle = computed(() =>
  props.streaming ? '已思考时长' : '思考耗时（第一个思考分片 → 最后一个分片）'
)

// streaming 时默认展开；done 时默认折叠（除非显式指定）
const expanded = ref(
  props.defaultExpanded ?? props.config?.defaultExpanded ?? props.streaming
)

const bodyRef = ref<HTMLElement | null>(null)

/** 是否还贴着底部。用户手动上滚后置 false，滚回底部自动恢复 */
const stickToBottom = ref(true)

/** 判定"贴底"的容差：留点余量，避免亚像素误差让跟随反复中断 */
const STICK_TOLERANCE = 24

function onScroll() {
  const el = bodyRef.value
  if (!el) return
  stickToBottom.value =
    el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_TOLERANCE
}

/**
 * 把滚动位置推到最底部。
 * 只在「允许滚动 + 开启跟随 + 当前贴底」三者同时成立时才动手——
 * 用户主动上滚查看前文时不能把他拽回底部。
 */
async function scrollToBottom() {
  if (!scrollable.value || !followStream.value || !stickToBottom.value) return
  await nextTick()
  const el = bodyRef.value
  if (el) el.scrollTop = el.scrollHeight
}

// streaming 切换：开始流式自动展开并恢复贴底
watch(
  () => props.streaming,
  (val) => {
    if (val) {
      expanded.value = true
      stickToBottom.value = true
    }
  }
)

// 内容增长时跟随（仅流式中；已完成的内容不再动滚动条）
watch(
  () => props.content,
  () => {
    if (props.streaming) scrollToBottom()
  }
)

// 展开瞬间也要贴底：折叠时容器 display:none，clientHeight 为 0，滚动状态是失效的
watch(expanded, (val) => {
  if (val) scrollToBottom()
})

onMounted(() => {
  if (props.streaming) scrollToBottom()
})

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

// 思考段耗时。比标题再轻一档，别把「思考中」这三个字的注意力分走；
// 数字每 100ms 跳一次，用等宽字形免得整行跟着抖
.acu-thinking-duration {
  color: var(--acu-text-muted);
  font-size: var(--acu-font-size-xs);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
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
