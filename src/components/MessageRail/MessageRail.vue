<template>
  <!--
    消息侧边条：贴在消息列表左边缘的一条竖直「刻度串」。
    **一轮问答 = 一根短横条**（用户提问开启新的一轮，其后到下一个提问之前的
    消息都算这一轮），条数随对话轮次增长。悬停某根条会浮出「提问 + 回答摘要」，
    点击跳转到那一轮的提问。形态参考 Codex 侧边那组小横条。

    定位契约：本组件是 `position: absolute`，宿主需是定位容器
    （MessageList 已满足）。默认贴左边缘、垂直居中。
  -->
  <div
    v-if="bars.length > 1"
    class="acu-rail"
    :style="{ '--acu-rail-idle': idleOpacity }"
    role="navigation"
    aria-label="对话轮次导航"
    @mouseenter="hovering = true"
    @mouseleave="onRailLeave"
  >
    <div
      ref="stackRef"
      class="acu-rail-stack"
      :style="{ gap: `${gap}px`, maxHeight: `${maxHeight}px` }"
      @scroll="onStackScroll"
    >
      <button
        v-for="(bar, i) in bars"
        :key="bar.id"
        type="button"
        class="acu-rail-bar"
        :class="{ 'is-active': bar.id === activeBarId, 'is-streaming': bar.streaming, 'is-hot': i === hotIndex }"
        :style="{ width: `${bar.width}px`, height: `${barHeight}px` }"
        :data-turn-id="bar.id"
        :aria-label="bar.title"
        :aria-current="bar.id === activeBarId ? 'true' : undefined"
        @click="onPick(i)"
        @mouseenter="hotIndex = i"
        @focus="hotIndex = i"
      />
    </div>

    <div v-if="showTooltip && hotBar" class="acu-rail-tip" :style="{ top: `${tipTop}px` }">
      <div v-if="hotBar.question" class="acu-rail-tip-q">{{ hotBar.question }}</div>
      <div class="acu-rail-tip-a">{{ hotBar.answer }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ChatMessage, MessageRailConfig } from '@/types'

/** 一根条 = 一轮问答 */
interface RailBar {
  /** 该轮的锚点消息 id（提问那条；没有提问时退化为该轮第一条） */
  id: string
  /** 提问摘要 */
  question: string
  /** 回答摘要 */
  answer: string
  /** aria-label */
  title: string
  width: number
  streaming: boolean
}

const props = withDefaults(
  defineProps<{
    messages: ChatMessage[]
    /** 当前选中（视口中心）的消息 id——组件会解析成它所属的那一轮 */
    activeId?: string | null
    config?: MessageRailConfig
    assistantName?: string
  }>(),
  {
    activeId: null,
    config: undefined,
    assistantName: 'AI'
  }
)

const emit = defineEmits<{
  (e: 'select', message: ChatMessage, turnIndex: number): void
}>()

const cfg = computed<Required<Omit<MessageRailConfig, 'enable'>>>(() => {
  const c = props.config ?? {}
  return {
    widthBy: c.widthBy ?? 'length',
    minWidth: c.minWidth ?? 8,
    maxWidth: c.maxWidth ?? 26,
    barHeight: c.barHeight ?? 3,
    maxGap: c.maxGap ?? 10,
    maxHeight: c.maxHeight ?? 320,
    idleOpacity: c.idleOpacity ?? 0.3,
    showTooltip: c.showTooltip ?? true,
    clickToScroll: c.clickToScroll ?? true
  }
})

const barHeight = computed(() => cfg.value.barHeight)
const maxHeight = computed(() => cfg.value.maxHeight)
const idleOpacity = computed(() => cfg.value.idleOpacity)
const showTooltip = computed(() => cfg.value.showTooltip)

/** 压平空白 + 截断，浮层里用 */
function plain(m: ChatMessage): string {
  return (m.content || m.reasoning || '').replace(/\s+/g, ' ').trim()
}
function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

interface RailTurn {
  anchor: ChatMessage
  question: string
  answer: string
  /** 这一轮包含的所有消息 id——用来把「视口中心的消息」解析成「哪一轮」 */
  msgIds: string[]
  /** 这一轮的总字数（正文 + 思考按半权计），条宽据此编码 */
  chars: number
  streaming: boolean
}

/**
 * 把消息按「轮」分组：**用户提问开启新的一轮**，其后到下一个提问之前的
 * assistant / system 消息都归入这一轮。
 *
 * 没有提问开头的消息（例如会话最初就是一条 assistant）会自成一「轮」，
 * 这样任何一条消息都必定归属于某一轮，active 判定不会落空。
 */
const turns = computed<RailTurn[]>(() => {
  const list: RailTurn[] = []
  for (const m of props.messages) {
    let t = list[list.length - 1]
    if (m.role === 'user' || !t) {
      t = { anchor: m, question: '', answer: '', msgIds: [], chars: 0, streaming: false }
      list.push(t)
    }
    t.msgIds.push(m.id)
    t.chars += (m.content?.length ?? 0) + (m.reasoning?.length ?? 0) * 0.5
    if (m.status === 'streaming' || m.status === 'pending') t.streaming = true

    const text = plain(m)
    if (m.role === 'user') {
      if (!t.question) t.question = text
    } else if (text) {
      // 一轮里可能有多条 assistant（工具调用后的续写），取最后一条有内容的
      t.answer = text
    }
  }
  return list
})

/**
 * 条宽。
 * - `even`：全部等宽（贴 max），节奏整齐，适合只看「聊了几轮」。
 * - `length`：**相对本轮对话归一**——把最短的一轮贴 min、最长的一轮贴 max，
 *   中间按对数插值。
 *
 * 为什么不做「绝对」刻度（例如写死 2000 字封顶）：真实对话里一轮就是几十到几百字，
 * 中文尤其「字少信息多」，绝对刻度会把这些轮次全压在同一小段宽度里 ——
 * 实测 6 轮的长度 64~160 字，绝对刻度只画出 17/18/19 三种宽度，肉眼看不出差别，
 * 「条宽反映篇幅」这个信号等于失效。归一化后同样的数据能铺满 min..max。
 * 代价是跨会话不可比（长短是相对这台对话的），但导航刻度本来就是看**节奏**的。
 */
const widths = computed<number[]>(() => {
  const list = turns.value
  const { widthBy, minWidth, maxWidth } = cfg.value
  if (!list.length) return []
  if (widthBy === 'even') return list.map(() => maxWidth)

  const chars = list.map((t) => Math.max(4, t.chars))
  const lo = Math.min(...chars)
  const hi = Math.max(...chars)
  // 各轮长度几乎一样 → 差异没有意义，统一贴 max 反而更整齐
  if (hi - lo < 1) return list.map(() => maxWidth)

  const llo = Math.log10(lo)
  const span = Math.log10(hi) - llo
  return chars.map((c) => {
    const ratio = Math.min(1, Math.max(0, (Math.log10(c) - llo) / span))
    return Math.round(minWidth + ratio * (maxWidth - minWidth))
  })
})

const bars = computed<RailBar[]>(() =>
  turns.value.map((t, i) => {
    const answer = t.answer
      ? clip(t.answer, 72)
      : t.streaming
        ? '正在生成…'
        : '（暂无回答）'
    const question = clip(t.question, 40)
    return {
      id: t.anchor.id,
      question,
      answer,
      title: `${question || '对话'} — ${answer}`,
      width: widths.value[i] ?? cfg.value.minWidth,
      streaming: t.streaming
    }
  })
)

/** 视口中心那条消息落在哪一轮，就高亮哪一根 */
const activeBarId = computed<string | null>(() => {
  const id = props.activeId
  if (!id) return null
  const hit = turns.value.find((t) => t.msgIds.includes(id))
  return hit?.anchor.id ?? null
})

/**
 * 间距自适应：轮次多时压缩间距，下限 4px。
 * 所以条组总高 = n*(barHeight+gap) - gap，超过 maxHeight 时由条组内部滚动兜底。
 */
const gap = computed(() => {
  const n = bars.value.length
  if (n <= 1) return cfg.value.maxGap
  const { maxGap, maxHeight: mh, barHeight: h } = cfg.value
  const step = (mh - h) / (n - 1)
  return Math.round(Math.min(maxGap, Math.max(4, step - h)))
})

// —— 悬停态 —— //
const hovering = ref(false)
const hotIndex = ref(-1)
const stackRef = ref<HTMLElement | null>(null)
const stackScroll = ref(0)

const hotBar = computed(() => (hotIndex.value >= 0 ? bars.value[hotIndex.value] ?? null : null))

/** 浮层的纵坐标 = 该条的偏移 - 条组已滚动的距离 */
const tipTop = computed(() => {
  const step = barHeight.value + gap.value
  return hotIndex.value * step + barHeight.value / 2 - stackScroll.value
})

function onStackScroll() {
  stackScroll.value = stackRef.value?.scrollTop ?? 0
}

function onRailLeave() {
  hovering.value = false
  hotIndex.value = -1
}

/** 点击 → 跳到这一轮的**提问**处（而不是这条 assistant 回答的中间） */
function onPick(i: number) {
  if (!cfg.value.clickToScroll) return
  const t = turns.value[i]
  if (t) emit('select', t.anchor, i)
}

// —— 当前条自动带回视野（条组内部滚动时） —— //
watch(activeBarId, () => {
  const idx = bars.value.findIndex((b) => b.id === activeBarId.value)
  const el = stackRef.value
  if (idx < 0 || !el) return
  const step = barHeight.value + gap.value
  const top = idx * step
  if (top < el.scrollTop) el.scrollTop = top
  else if (top + step > el.scrollTop + el.clientHeight) {
    el.scrollTop = top + step - el.clientHeight
  }
})

defineExpose({ hovering })
</script>

<style lang="scss" scoped>
.acu-rail {
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 6px;
  border-radius: var(--acu-radius);
  opacity: var(--acu-rail-idle, 0.3);
  transition: opacity var(--acu-duration) var(--acu-easing);

  &:hover,
  &:focus-within {
    opacity: 1;
  }
}

.acu-rail-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.acu-rail-bar {
  flex: 0 0 auto;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: var(--acu-text-muted);
  cursor: pointer;
  transition: background-color var(--acu-duration) var(--acu-easing);
  @include acu-focus-ring(2px);

  &:hover,
  &.is-hot {
    background: var(--acu-text-secondary);
  }

  &.is-active {
    // 只换颜色、不动宽度：宽度是数据（这一轮的长度）的编码，
    // 再叠一个 scaleX 会让「这轮更长」这个语义失真
    background: var(--acu-primary);
  }

  &.is-streaming {
    animation: acu-rail-pulse 1.2s var(--acu-easing) infinite;
  }
}

@keyframes acu-rail-pulse {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .acu-rail-bar.is-streaming {
    animation: none;
  }
}

/* —— 悬停浮层：提问 + 回答摘要 —— */
.acu-rail-tip {
  position: absolute;
  left: 100%;
  margin-left: 8px;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: max-content;
  min-width: 150px;
  max-width: 260px;
  padding: 7px 10px;
  background: var(--acu-text);
  color: var(--acu-bg);
  border-radius: var(--acu-radius-sm);
  font-size: var(--acu-font-size-xs);
  line-height: 1.45;
  pointer-events: none;
  z-index: 4;
}

/* 两行都做行数钳制：浮层贴着条走，太长会盖住整屏 */
.acu-rail-tip-q,
.acu-rail-tip-a {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.acu-rail-tip-q {
  -webkit-line-clamp: 2;
  font-weight: 600;
}

.acu-rail-tip-a {
  -webkit-line-clamp: 2;
  opacity: 0.68;
}
</style>
