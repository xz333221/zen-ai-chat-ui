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

    <!-- 调用列表：折叠时只保留最新一个 -->
    <div class="acu-toolgroup-list">
      <ToolCallBlock
        v-for="(tc, index) in toolCalls"
        v-show="!grouped || expanded || index === toolCalls.length - 1"
        :key="tc.id"
        :tool-call="tc"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ToolCall, ToolCallStatus, ToolCallsConfig } from '@/types'
import ToolCallBlock from '@/components/ToolCallBlock/ToolCallBlock.vue'

const props = withDefaults(
  defineProps<{
    /** 该消息上的全部工具调用（按调用顺序） */
    toolCalls: ToolCall[]
    /** 展示配置 */
    config?: ToolCallsConfig
  }>(),
  {
    config: undefined
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

.acu-toolgroup-header {
  display: flex;
  align-items: center;
  gap: var(--acu-space-2);
  width: 100%;
  padding: var(--acu-space-1-5) var(--acu-space-2-5);
  margin-bottom: var(--acu-space-1);
  border: 1px dashed var(--acu-border);
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
    border-color: var(--acu-primary);
  }

  &.is-expanded {
    border-style: solid;
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
