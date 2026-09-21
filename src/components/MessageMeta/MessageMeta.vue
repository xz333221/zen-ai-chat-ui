<template>
  <!--
    消息元信息行：耗时 / 首字延迟 / token 用量 / 发送时间。
    纯展示，不含交互；对齐方式由父级（MessageBubble）决定。
    流式期间「耗时」会用本地计时器实时跳动，结束时固化成最终值。
  -->
  <div v-if="rendered.length" class="acu-message-meta" :class="`is-${message.role}`">
    <span
      v-for="(item, i) in rendered"
      :key="i"
      class="acu-meta-item"
      :class="`is-${item.key}`"
      :title="item.title || undefined"
    >{{ item.value }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ChatMessage, MessageMetaConfig, MessageMetaItem } from '@/types'
import { formatClock, formatDuration, formatTokens } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    message: ChatMessage
    config?: MessageMetaConfig
  }>(),
  {
    config: () => ({})
  }
)

interface RenderedItem {
  key: string
  value: string
  title?: string
}

const items = computed<MessageMetaItem[]>(() => props.config.items ?? ['duration', 'tokens'])
const startedAt = computed(() => props.message.createdAt ?? 0)
const isRunning = computed(
  () => props.message.status === 'streaming' || props.message.status === 'pending'
)

// —— 流式期间实时跳动的耗时 ——
// 只在「正在生成」且确实要展示耗时时才跑计时器，避免给整屏历史消息白开定时器。
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null

function stopTicker() {
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
}

watch(
  [isRunning, () => items.value.includes('duration'), startedAt],
  ([running, wantsDuration, start]) => {
    stopTicker()
    if (!running || !wantsDuration || !start) return
    now.value = Date.now()
    ticker = setInterval(() => {
      now.value = Date.now()
    }, 100)
  },
  { immediate: true }
)

onBeforeUnmount(stopTicker)

// —— 各项文本 ——

/** 耗时：显式值 > finishedAt - createdAt > 流式期间实时值 */
const durationText = computed(() => {
  const explicit = props.message.meta?.durationMs
  if (typeof explicit === 'number') return formatDuration(explicit)

  const start = startedAt.value
  if (!start) return ''

  const end = props.message.finishedAt
  if (typeof end === 'number' && end > start) return formatDuration(end - start)
  if (isRunning.value) return formatDuration(now.value - start)
  return ''
})

const firstTokenText = computed(() => {
  const explicit = props.message.meta?.firstTokenMs
  if (typeof explicit === 'number' && explicit >= 0) return formatDuration(explicit)

  // 首字延迟在第一个分片到达的那一刻就已经确定了，不必等 finish() 回填——
  // 流式期间就能看到「第一句话等了多久」才是这个指标的价值所在。
  const start = startedAt.value
  const first = props.message.firstTokenAt
  if (start && typeof first === 'number' && first >= start) return formatDuration(first - start)
  return ''
})

/**
 * token：输入输出都给时用 `↑3 ↓7` 的紧凑形式（信息密度最高），
 * 只给总数时退化成 `123 tokens`。
 */
const tokensText = computed(() => {
  const u = props.message.meta?.usage
  if (!u) return ''
  if (typeof u.prompt === 'number' && typeof u.completion === 'number') {
    return `↑${formatTokens(u.prompt)} ↓${formatTokens(u.completion)}`
  }
  const only = typeof u.total === 'number' ? u.total : (u.prompt ?? u.completion)
  return typeof only === 'number' ? `${formatTokens(only)} tokens` : ''
})

/** 数字太少的话，明细放 tooltip 里，不占版面 */
const tokensTitle = computed(() => {
  const u = props.message.meta?.usage
  if (!u) return ''
  const total = u.total ?? (u.prompt ?? 0) + (u.completion ?? 0)
  const parts: string[] = []
  if (total) parts.push(`共 ${total.toLocaleString('en-US')} tokens`)
  if (typeof u.prompt === 'number') parts.push(`输入 ${u.prompt.toLocaleString('en-US')}`)
  if (typeof u.completion === 'number') parts.push(`输出 ${u.completion.toLocaleString('en-US')}`)
  if (typeof u.reasoning === 'number') parts.push(`思考 ${u.reasoning.toLocaleString('en-US')}`)
  if (typeof u.cached === 'number') parts.push(`缓存命中 ${u.cached.toLocaleString('en-US')}`)
  return parts.join(' · ')
})

const timeText = computed(() => (startedAt.value ? formatClock(startedAt.value) : ''))

function buildItem(key: MessageMetaItem): RenderedItem | null {
  switch (key) {
    case 'duration':
      return durationText.value ? { key, value: durationText.value, title: '回答耗时' } : null
    case 'firstToken':
      return firstTokenText.value
        ? { key, value: firstTokenText.value, title: '首字延迟（从发送到第一个字到达）' }
        : null
    case 'tokens':
      return tokensText.value ? { key, value: tokensText.value, title: tokensTitle.value } : null
    case 'time':
      return timeText.value ? { key, value: timeText.value, title: '发送时间' } : null
    default:
      return null
  }
}

const rendered = computed<RenderedItem[]>(() => {
  const list: RenderedItem[] = []
  for (const key of items.value) {
    const item = buildItem(key)
    if (item) list.push(item)
  }
  // extra：自定义项永远排在内置项后面，不受 items 顺序影响
  for (const ex of props.message.meta?.extra ?? []) {
    if (!ex?.value) continue
    list.push({
      key: 'extra',
      value: ex.label ? `${ex.label} ${ex.value}` : ex.value,
      title: ex.title
    })
  }
  return list
})
</script>

<style lang="scss" scoped>
.acu-message-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0;
  font-size: var(--acu-font-size-2xs);
  line-height: 1.6;
  color: var(--acu-text-muted);
  // 数字等宽，避免流式期间耗时跳动带动整行左右抖
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.acu-meta-item {
  white-space: nowrap;

  // 分隔点用伪元素画，省一层 DOM，且换行时不会孤立在行首
  & + .acu-meta-item::before {
    content: '·';
    margin: 0 5px;
    color: var(--acu-border-strong);
  }
}

// token 的 ↑↓ 比耗时略深一点，两类信息一眼能分开
.acu-meta-item.is-tokens {
  color: var(--acu-text-secondary);
}
</style>
