<template>
  <!--
    消息侧边条：贴在消息列表左边缘的一条竖直「刻度串」。
    一条消息 = 一根短横条，条数随对话增长；用来一眼看清对话结构并快速跳转。
    形态参考 Codex 侧边那组小横条。

    定位契约：本组件是 `position: absolute`，宿主需是定位容器
    （MessageList 已满足）。默认贴左边缘、垂直居中。
  -->
  <div
    v-if="bars.length > 1"
    class="acu-rail"
    :style="{ '--acu-rail-idle': idleOpacity }"
    role="navigation"
    aria-label="消息导航"
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
        :class="[
          `is-${bar.role}`,
          { 'is-active': bar.id === activeId, 'is-streaming': bar.streaming, 'is-hot': i === hotIndex }
        ]"
        :style="{ width: `${bar.width}px`, height: `${barHeight}px` }"
        :aria-label="bar.title"
        :aria-current="bar.id === activeId ? 'true' : undefined"
        @click="onPick(i)"
        @mouseenter="hotIndex = i"
        @focus="hotIndex = i"
      />
    </div>

    <div v-if="showTooltip && hotBar" class="acu-rail-tip" :style="{ top: `${tipTop}px` }">
      <span class="acu-rail-tip-role">{{ hotBar.roleName }}</span>
      <span class="acu-rail-tip-text">{{ hotBar.snippet }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ChatMessage, MessageRailConfig } from '@/types'

interface RailBar {
  id: string
  role: ChatMessage['role']
  roleName: string
  snippet: string
  title: string
  width: number
  streaming: boolean
}

const props = withDefaults(
  defineProps<{
    messages: ChatMessage[]
    /** 当前选中（视口中心）的消息 id */
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
  (e: 'select', message: ChatMessage, index: number): void
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

/**
 * 条宽。
 * - `length`：按内容长度做对数缩放（4 字以下贴 min，2000 字以上贴 max）。
 *   用对数是因为对话长度是长尾分布，线性缩放会让短消息全部挤成一条线。
 * - `role`：按角色固定，user 贴 min、assistant 贴 max，节奏稳定不抖动。
 */
function widthFor(m: ChatMessage): number {
  const { widthBy, minWidth, maxWidth } = cfg.value
  if (widthBy === 'role') return m.role === 'assistant' ? maxWidth : minWidth
  const len = (m.content?.length ?? 0) + (m.reasoning?.length ?? 0) * 0.5
  const ratio = Math.log10(Math.max(4, len)) / Math.log10(2000)
  return Math.round(minWidth + Math.min(1, Math.max(0, ratio)) * (maxWidth - minWidth))
}

function snippetOf(m: ChatMessage): string {
  const raw = (m.content || m.reasoning || '').replace(/\s+/g, ' ').trim()
  if (!raw) return m.status === 'streaming' ? '正在生成…' : '（空消息）'
  return raw.length > 36 ? `${raw.slice(0, 36)}…` : raw
}

const bars = computed<RailBar[]>(() =>
  props.messages.map((m) => {
    const roleName = m.role === 'user' ? '你' : props.assistantName
    const snippet = snippetOf(m)
    return {
      id: m.id,
      role: m.role,
      roleName,
      snippet,
      title: `${roleName}：${snippet}`,
      width: widthFor(m),
      streaming: m.status === 'streaming' || m.status === 'pending'
    }
  })
)

/**
 * 间距自适应：消息多时压缩间距，下限 4px。
 * 所以条组总高 = n*(barHeight+gap) - gap，超过 maxHeight 时由条组内部滚动兜底。
 */
const gap = computed(() => {
  const n = bars.value.length
  if (n <= 1) return cfg.value.maxGap
  const { maxGap, maxHeight, barHeight: h } = cfg.value
  const step = (maxHeight - h) / (n - 1)
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

function onPick(i: number) {
  if (!cfg.value.clickToScroll) return
  const m = props.messages[i]
  if (m) emit('select', m, i)
}

// —— 当前条自动带回视野（条组内部滚动时） —— //
watch(
  () => props.activeId,
  () => {
    const idx = bars.value.findIndex((b) => b.id === props.activeId)
    const el = stackRef.value
    if (idx < 0 || !el) return
    const step = barHeight.value + gap.value
    const top = idx * step
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + step > el.scrollTop + el.clientHeight) {
      el.scrollTop = top + step - el.clientHeight
    }
  }
)

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
  transition: background-color var(--acu-duration) var(--acu-easing),
    transform var(--acu-duration-fast) var(--acu-easing);
  @include acu-focus-ring(2px);

  &:hover,
  &.is-hot {
    background: var(--acu-text-secondary);
  }

  &.is-active {
    // 只换颜色、不动宽度：宽度是数据（消息长度）的编码，
    // 再叠一个 scaleX 会让「长回答更长」这个语义失真
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

.acu-rail-tip {
  position: absolute;
  left: 100%;
  margin-left: 8px;
  transform: translateY(-50%);
  display: flex;
  align-items: baseline;
  gap: var(--acu-space-2);
  max-width: 280px;
  padding: 5px 10px;
  background: var(--acu-text);
  color: var(--acu-bg);
  border-radius: var(--acu-radius-sm);
  font-size: var(--acu-font-size-xs);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  pointer-events: none;
  z-index: 4;
}

.acu-rail-tip-role {
  flex: 0 0 auto;
  font-weight: 600;
  opacity: 0.7;
}

.acu-rail-tip-text {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
