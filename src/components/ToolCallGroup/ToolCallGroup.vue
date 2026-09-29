<template>
  <!--
    工具调用组。
    同一条 assistant 消息里往往会出现十几个连续的工具调用，
    全部平铺会把气泡撑得很长。这里默认把它们折叠成一组：

    - 折叠态（默认）：组头（聚合状态 + 数量）+ 仅最新一个工具调用
    - 展开态：组头 + 全部工具调用（按调用顺序）
    - 只有 1 个调用、或 config.group === false 时不分组，退化为原样渲染
  -->
  <div class="acu-toolgroup">
    <!-- 组头：仅多个调用时才出现 -->
    <button
      v-if="grouped"
      type="button"
      class="acu-toolgroup-header"
      :class="{ 'is-expanded': expanded }"
      :aria-expanded="expanded"
      @click="toggle"
    >
      <!-- 聚合状态图标 -->
      <span class="acu-toolgroup-status" :class="`is-${aggregateStatus}`">
        <svg v-if="aggregateStatus === 'running'" class="acu-spin" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <svg v-else-if="aggregateStatus === 'done'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <svg v-else-if="aggregateStatus === 'error'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </span>

      <!-- 层叠图标 -->
      <span class="acu-toolgroup-icon">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2 2 7l10 5 10-5-10-5z" />
          <path d="m2 12 10 5 10-5" />
          <path d="m2 17 10 5 10-5" />
        </svg>
      </span>

      <span class="acu-toolgroup-label">{{ headerLabel }}</span>

      <!-- 展开 / 收起文案 -->
      <span class="acu-toolgroup-hint">{{ expanded ? '收起' : '全部' }}</span>

      <svg class="acu-toolgroup-chevron" :class="{ expanded }" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <!-- 调用列表：折叠时只保留最新一个（计划块另算，见下） -->
    <div class="acu-toolgroup-list">
      <ToolCallBlock v-for="tc in visibleCalls" :key="tc.id" :tool-call="tc" :plan-config="planConfig" />
    </div>

    <!--
      计划块常驻区。
      折叠态只留「最新一个工具调用」，而计划往往不是最后那个（模型改完计划会去干别的）——
      那样计划就被折没了，而计划正是最需要一直看着的东西。所以把它提出来单独渲染。
      只取最新一份计划：连续多次 update_plan 留的是同一件事的快照，旧的全展示只会刷屏。
    -->
    <div v-if="pinnedPlan" class="acu-toolgroup-plan">
      <ToolCallBlock :tool-call="pinnedPlan" :plan-config="planConfig" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { PlanConfig, ToolCall, ToolCallStatus, ToolCallsConfig } from '@/types'
import { readPlan } from '@/utils/plan'
import ToolCallBlock from '@/components/ToolCallBlock/ToolCallBlock.vue'

const props = withDefaults(
  defineProps<{
    /** 该消息上的全部工具调用（按调用顺序） */
    toolCalls: ToolCall[]
    /** 展示配置 */
    config?: ToolCallsConfig
    /** 计划块展示配置（透传给每个调用） */
    planConfig?: PlanConfig
  }>(),
  {
    config: undefined,
    planConfig: undefined
  }
)

/** 折叠阈值：调用数量 >= 该值时才折叠成组 */
const threshold = computed(() => Math.max(2, props.config?.collapseThreshold ?? 2))

/** 是否需要折叠分组 */
const grouped = computed(
  () => props.config?.group !== false && props.toolCalls.length >= threshold.value
)

const expanded = ref(props.config?.defaultExpanded ?? false)

// 配置变化（如业务侧切换 defaultExpanded）时同步一次
watch(
  () => props.config?.defaultExpanded,
  (v) => {
    expanded.value = v ?? false
  }
)

function toggle() {
  expanded.value = !expanded.value
}

/** 折叠态钉住的那份计划（最新的那个计划调用）；展开态不钉，全量按序渲染 */
const pinnedPlan = computed<ToolCall | null>(() => {
  if (!grouped.value || expanded.value) return null
  for (let i = props.toolCalls.length - 1; i >= 0; i--) {
    if (readPlan(props.toolCalls[i])) return props.toolCalls[i]
  }
  return null
})

/**
 * 实际渲染出来的调用列表：折叠态只留最新一个（计划块在下面单独渲染，这里要去重）。
 *
 * 为什么算好列表用 v-for，而不是给每一行挂 v-show（2026-09-29 改）：
 * v-show 打在**组件**上时，Vue 会把指令合并到该组件的根节点 vnode 上；而根节点是不是
 * "真元素"取决于模板怎么编出来的 —— 模板开头有注释且 dist 是 dev 模式编译时，根节点是
 * Fragment（DEV_ROOT_FRAGMENT），**只有 dev 版 Vue 会把它展开回真实元素**，生产版 Vue
 * 不会：指令于是挂在 Fragment 上，永远不执行（dev 里还会警告 non-element root node）。
 * 症状就是"折叠只换文案，行一条不少"，而且只在生产包/正式版里出现 —— 踩过一次。
 * 顺带好处：折叠态 DOM 里只有 1 行，长任务（几十次调用）不再挂几十个隐藏节点。
 */
const visibleCalls = computed(() => {
  if (!grouped.value || expanded.value) return props.toolCalls
  const last = props.toolCalls[props.toolCalls.length - 1]
  const pinned = pinnedPlan.value
  // 最后一个恰好就是被钉住的计划 → 交给下面的常驻区渲染，这里不再重复
  if (pinned && last && last.id === pinned.id) return []
  return last ? [last] : []
})

/** 聚合状态：running 优先，其次 error，最后 done */
const stats = computed(() => {
  let running = 0
  let error = 0
  let done = 0
  for (const tc of props.toolCalls) {
    const s: ToolCallStatus = tc.status || 'pending'
    if (s === 'running') running++
    else if (s === 'error') error++
    else if (s === 'done') done++
  }
  return { total: props.toolCalls.length, running, error, done }
})

const aggregateStatus = computed<ToolCallStatus>(() => {
  const s = stats.value
  if (s.running > 0) return 'running'
  if (s.error > 0) return 'error'
  if (s.done > 0) return 'done'
  return 'pending'
})

const headerLabel = computed(() => {
  const s = stats.value
  if (s.running > 0) {
    return `正在调用工具 ${s.done}/${s.total}`
  }
  if (s.error > 0) {
    return `已调用 ${s.total} 个工具 · ${s.error} 个失败`
  }
  return `已调用 ${s.total} 个工具`
})
</script>

<style lang="scss" scoped>
.acu-toolgroup {
  margin: var(--acu-space-1) 0;
}

.acu-toolgroup-plan {
  margin-top: var(--acu-space-1);
}

.acu-toolgroup-header {
  display: flex;
  align-items: center;
  gap: var(--acu-space-2);
  width: 100%;
  padding: var(--acu-space-1-5) var(--acu-space-2-5);
  margin-bottom: var(--acu-space-1);
  // 原来是虚线边框（用「虚线 = 还没展开」当语义载体）。虚线在正文里读起来像
  // 未完成的占位，改成实线；展开与否交给左侧 chevron 和底色表达
  border: 1px solid var(--acu-border);
  border-radius: var(--acu-radius-sm);
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  font-size: var(--acu-font-size-sm);
  color: var(--acu-text-secondary);
  text-align: left;
  transition: background var(--acu-duration-fast) var(--acu-easing),
    border-color var(--acu-duration-fast) var(--acu-easing);

  &:hover {
    background: var(--acu-surface-2);
    border-color: var(--acu-border-strong);
  }

  &.is-expanded {
    background: var(--acu-surface-2);
  }
}

.acu-toolgroup-status {
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

.acu-toolgroup-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--acu-text-muted);
  flex-shrink: 0;
}

.acu-toolgroup-label {
  font-size: var(--acu-font-size-sm);
  color: var(--acu-text-secondary);
  @include acu-ellipsis(1);
  min-width: 0;
}

.acu-toolgroup-hint {
  margin-left: auto;
  flex-shrink: 0;
  font-size: var(--acu-font-size-xs);
  color: var(--acu-text-muted);
}

.acu-toolgroup-chevron {
  flex-shrink: 0;
  color: var(--acu-text-muted);
  transition: transform var(--acu-duration-fast) var(--acu-easing);

  &.expanded {
    transform: rotate(180deg);
  }
}

.acu-spin {
  animation: acu-spin 0.8s linear infinite;
}
@keyframes acu-spin {
  to { transform: rotate(360deg); }
}
</style>
