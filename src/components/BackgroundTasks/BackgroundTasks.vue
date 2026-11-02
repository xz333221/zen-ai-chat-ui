<template>
  <!--
    后台任务条：还在跑的后台进程（`status === 'background'`）不进消息里的工具组，
    统一收到输入框上方这一条里 —— 它们的价值是「还活着、还在吐日志」，
    跟着对话往上滚走就再也看不见了。

    - 默认折叠：只有一行「后台任务 · N 项」+ 脉冲点，点开才铺出每个任务
    - 单个任务也默认折叠（参数/结果要点一下），避免输入框被日志顶走
    - 只负责展示，数据由 ChatContainer 跨消息汇总后传进来
  -->
  <div class="acu-bgtasks">
    <button
      type="button"
      class="acu-bgtasks-head"
      :aria-expanded="expanded"
      :title="expanded ? label.collapse : label.expand"
      @click="expanded = !expanded"
    >
      <!-- 脉冲点：进程还在跑，既不是转圈（这一轮已返回）也不是绿勾（没结束） -->
      <span class="acu-bgtasks-dot" aria-hidden="true">
        <span class="acu-bgtasks-dot-core" />
      </span>

      <span class="acu-bgtasks-title">{{ label.title }}</span>
      <span class="acu-bgtasks-count">{{ toolCalls.length }} {{ label.unit }}</span>

      <span class="acu-bgtasks-spacer" />

      <span class="acu-bgtasks-hint">{{ expanded ? label.collapse : label.expand }}</span>
      <svg
        class="acu-bgtasks-chevron"
        :class="{ expanded }"
        viewBox="0 0 24 24"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <div v-if="expanded" class="acu-bgtasks-list">
      <ToolCallBlock
        v-for="tc in toolCalls"
        :key="tc.id"
        :tool-call="tc"
        :expand-background="false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { BackgroundTasksLabels, ToolCall } from '@/types'
import ToolCallBlock from '@/components/ToolCallBlock/ToolCallBlock.vue'

const props = withDefaults(
  defineProps<{
    /** 还在跑的后台调用（顺序即展示顺序，由宿主汇总好） */
    toolCalls: ToolCall[]
    /**
     * 初始是否收起。
     * @default true
     */
    defaultCollapsed?: boolean
    /** 文案覆盖（宿主项目要走 i18n 时传自己的翻译） */
    labels?: Partial<BackgroundTasksLabels>
  }>(),
  {
    defaultCollapsed: true,
    labels: undefined
  }
)

const DEFAULT_LABELS: Required<BackgroundTasksLabels> = {
  title: '后台任务',
  unit: '项',
  expand: '展开',
  collapse: '收起'
}

const label = computed<Required<BackgroundTasksLabels>>(() => ({
  ...DEFAULT_LABELS,
  ...props.labels
}))

const expanded = ref(!props.defaultCollapsed)
</script>

<style lang="scss" scoped>
.acu-bgtasks {
  // 底色而不是描边：输入框本身已经是「描边 + 投影」的卡片，
  // 上面再压一层描边会变成两条平行线，看着像嵌套表单
  background: var(--acu-surface);
  border-radius: var(--acu-radius-sm);
  overflow: hidden;
}

.acu-bgtasks-head {
  display: flex;
  align-items: center;
  gap: var(--acu-space-2);
  width: 100%;
  padding: 6px var(--acu-space-2-5);
  border: 0;
  background: transparent;
  color: var(--acu-text-secondary);
  font-family: inherit;
  font-size: var(--acu-font-size-xs);
  line-height: var(--acu-line-height-tight);
  cursor: pointer;
  transition: background-color var(--acu-duration-fast) var(--acu-easing);
  @include acu-focus-ring;

  &:hover {
    background: var(--acu-surface-2);

    .acu-bgtasks-hint {
      color: var(--acu-text-secondary);
    }
  }
}

.acu-bgtasks-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--acu-warning);
}

.acu-bgtasks-dot-core {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  animation: acu-bgtasks-pulse 1.6s ease-in-out infinite;
}

@keyframes acu-bgtasks-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.4;
    transform: scale(0.78);
  }
}

@media (prefers-reduced-motion: reduce) {
  .acu-bgtasks-dot-core {
    animation: none;
  }
}

.acu-bgtasks-title {
  font-weight: 600;
  color: var(--acu-text);
  flex-shrink: 0;
}

.acu-bgtasks-count {
  color: var(--acu-text-muted);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.acu-bgtasks-spacer {
  flex: 1;
  min-width: 0;
}

// 悬停时才提亮：静息态留白干净（这一条只是状态的注脚，不是主操作）
.acu-bgtasks-hint {
  color: var(--acu-text-muted);
  flex-shrink: 0;
  transition: color var(--acu-duration-fast) var(--acu-easing);
}

.acu-bgtasks-chevron {
  flex-shrink: 0;
  color: var(--acu-text-muted);
  transition: transform var(--acu-duration-fast) var(--acu-easing);

  &.expanded {
    transform: rotate(180deg);
  }
}

.acu-bgtasks-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 var(--acu-space-1) var(--acu-space-1);
}
</style>
