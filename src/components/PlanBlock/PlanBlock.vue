<template>
  <!--
    计划块：把「一串带状态的步骤」渲染成清单，而不是一坨 JSON。

    - 三态各有一个图形：完成 ✓、进行中（脉冲点）、待办（空心圈）
    - 标题右侧是 `2/5` 进度，下方一条 2px 细进度条
    - 步骤超过一屏高度时内部滚动，不把气泡撑到看不见正文
  -->
  <div class="acu-plan" :class="{ 'is-running': status === 'running' }">
    <!-- 标题行 -->
    <div class="acu-plan-header">
      <span class="acu-plan-icon">
        <svg v-if="status === 'running'" class="acu-spin" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      </span>
      <span class="acu-plan-title">{{ titleText }}</span>
      <span v-if="showProgress" class="acu-plan-count">{{ progressText }}</span>
    </div>

    <!-- 细进度条 -->
    <div v-if="showBar" class="acu-plan-bar" role="presentation">
      <span class="acu-plan-bar-fill" :style="{ width: barWidth }" />
    </div>

    <!-- 计划说明（模型对这次调整给的解释） -->
    <p v-if="note" class="acu-plan-note">{{ note }}</p>

    <!-- 步骤清单 -->
    <ul class="acu-plan-steps">
      <li
        v-for="(step, i) in steps"
        :key="`${i}-${step.content}`"
        class="acu-plan-step"
        :class="`is-${stepStatus(step)}`"
      >
        <span class="acu-plan-marker" aria-hidden="true">
          <svg v-if="stepStatus(step) === 'completed'" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span v-else-if="stepStatus(step) === 'in_progress'" class="acu-plan-dot" />
        </span>
        <span class="acu-plan-body">
          <span class="acu-plan-content">{{ step.content }}</span>
          <span v-if="step.note" class="acu-plan-step-note">{{ step.note }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PlanConfig, PlanStep, PlanStepStatus, ToolCallStatus } from '@/types'
import { planProgress } from '@/utils/plan'

const props = withDefaults(
  defineProps<{
    /** 步骤 */
    steps: PlanStep[]
    /** 计划说明（模型对这次调整的解释） */
    note?: string
    /** 整块所处的工具状态：running 时标题图标转圈 */
    status?: ToolCallStatus
    /** 展示配置 */
    config?: PlanConfig
  }>(),
  {
    note: undefined,
    status: 'done',
    config: undefined
  }
)

const titleText = computed(() => props.config?.title || props.config?.labels?.title || '计划')

const showProgress = computed(() => props.config?.progress !== false && stats.value.total > 0)

const progressText = computed(() => {
  const template = props.config?.labels?.progress || '{done}/{total}'
  return template
    .replace('{done}', String(stats.value.done))
    .replace('{total}', String(stats.value.total))
})

const showBar = computed(() => props.config?.progressBar !== false && stats.value.total > 0)

// 只按「已完成」算完成度：进行中的那一步还没做完
const barWidth = computed(() => {
  const { done, total } = stats.value
  if (!total) return '0%'
  return `${Math.round((done / total) * 100)}%`
})

const stats = computed(() => planProgress(props.steps))

function stepStatus(step: PlanStep): PlanStepStatus {
  return step.status || 'pending'
}
</script>

<style lang="scss" scoped>
.acu-plan {
  border: 1px solid var(--acu-border);
  border-radius: var(--acu-radius-sm);
  background: var(--acu-surface);
  margin: var(--acu-space-1) 0;
  padding: var(--acu-space-2) var(--acu-space-2-5) var(--acu-space-2-5);
}

.acu-plan.is-running {
  border-color: var(--acu-border-strong);
}

.acu-plan-header {
  display: flex;
  align-items: center;
  gap: var(--acu-space-2);
}

.acu-plan-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--acu-text-muted);

  .is-running & {
    color: var(--acu-primary);
  }
}

.acu-plan-title {
  font-size: var(--acu-font-size-sm);
  font-weight: 600;
  color: var(--acu-text);
}

.acu-plan-count {
  margin-left: auto;
  flex-shrink: 0;
  font-size: var(--acu-font-size-2xs);
  font-family: var(--acu-font-mono);
  color: var(--acu-text-muted);
}

.acu-plan-bar {
  height: 2px;
  border-radius: var(--acu-radius-full);
  background: var(--acu-border);
  overflow: hidden;
  margin-top: var(--acu-space-1-5);
}

.acu-plan-bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--acu-success);
  transition: width var(--acu-duration) var(--acu-easing);
}

.acu-plan-note {
  margin: var(--acu-space-1-5) 0 0;
  font-size: var(--acu-font-size-xs);
  line-height: var(--acu-line-height-tight);
  color: var(--acu-text-muted);
  word-break: break-word;
}

.acu-plan-steps {
  list-style: none;
  margin: var(--acu-space-2) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--acu-space-1-5);
  // 步数多时（上限 20）内部滚动，别把气泡顶到屏幕外
  max-height: 320px;
  overflow-y: auto;
  @include acu-scrollbar(5px);
}

.acu-plan-step {
  display: flex;
  align-items: flex-start;
  gap: var(--acu-space-2);
  font-size: var(--acu-font-size-sm);
  line-height: var(--acu-line-height-tight);
}

.acu-plan-marker {
  // 与首行文字基线对齐：18px 行高框里放 14px 圆
  @include acu-flex-center;
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin-top: 3px;
  border-radius: var(--acu-radius-full);
  border: 1.5px solid var(--acu-border-strong);
  color: transparent;

  .is-completed & {
    border-color: var(--acu-success);
    background: var(--acu-success);
    color: #fff;
  }

  .is-in_progress & {
    border-color: var(--acu-primary);
  }
}

.acu-plan-dot {
  width: 5px;
  height: 5px;
  border-radius: var(--acu-radius-full);
  background: var(--acu-primary);
  animation: acu-plan-pulse 1.4s ease-in-out infinite;
}

.acu-plan-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.acu-plan-content {
  color: var(--acu-text-secondary);
  word-break: break-word;

  .is-completed & {
    color: var(--acu-text-muted);
    text-decoration: line-through;
    text-decoration-color: var(--acu-border-strong);
  }

  .is-in_progress & {
    color: var(--acu-text);
    font-weight: 500;
  }
}

.acu-plan-step-note {
  font-size: var(--acu-font-size-2xs);
  color: var(--acu-text-muted);
  word-break: break-word;
}

@keyframes acu-plan-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.7); }
}

.acu-spin {
  animation: acu-plan-spin 0.8s linear infinite;
}
@keyframes acu-plan-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .acu-plan-dot,
  .acu-plan-icon .acu-spin {
    animation: none;
  }
}
</style>
