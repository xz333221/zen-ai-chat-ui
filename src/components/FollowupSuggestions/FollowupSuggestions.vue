<template>
  <!--
    追问建议列表（豆包风格）。
    位于 assistant 气泡下方、独立区域，与气泡左对齐。
    竖排胶囊卡片：浅灰描边、悬停主色、文字 + 右箭头。
  -->
  <div v-if="visible" class="acu-followup" :class="{ 'is-loading': loading }">
    <div v-if="title || loading" class="acu-followup-title">
      <span v-if="!loading">{{ title }}</span>
      <span v-else class="acu-followup-loading">
        <span class="acu-followup-dot"></span>
        <span class="acu-followup-dot"></span>
        <span class="acu-followup-dot"></span>
        正在生成追问…
      </span>
    </div>

    <div class="acu-followup-list">
      <button
        v-for="q in items"
        :key="q.id"
        type="button"
        class="acu-followup-item"
        @click="$emit('select', q)"
      >
        <span class="acu-followup-item-label">{{ q.label }}</span>
        <svg
          class="acu-followup-item-arrow"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="7" y1="17" x2="17" y2="7" />
          <polyline points="7 7 17 7 17 17" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PresetQuestion } from '@/types'

const props = withDefaults(
  defineProps<{
    /** 追问列表（为空时不渲染） */
    items?: PresetQuestion[]
    /** 区段标题 */
    title?: string
    /** 加载中（provider 调用期间） */
    loading?: boolean
  }>(),
  {
    items: () => [],
    title: '继续追问',
    loading: false
  }
)

defineEmits<{
  (e: 'select', question: PresetQuestion): void
}>()

const visible = computed(() => props.loading || (props.items && props.items.length > 0))
</script>

<style lang="scss" scoped>
.acu-followup {
  // 与 assistant 气泡对齐：左侧 = 头像宽度(32) + 气泡 gap(12) = 44px
  padding-left: calc(var(--acu-avatar-size) + var(--acu-space-3));
  margin-top: var(--acu-space-3);
  margin-bottom: var(--acu-space-2);
  // 自适应宽度：跟随内容长度，但不超过气泡最大宽度（与气泡同一个令牌，左右边缘对齐）
  width: fit-content;
  max-width: var(--acu-bubble-max-width);
  // 在 flex 父级（如 .acu-message-list-inner）下不强制拉伸
  align-self: flex-start;
  animation: acu-followup-in 0.28s var(--acu-easing) both;
}

.acu-followup-title {
  font-size: var(--acu-font-size-xs);
  color: var(--acu-text-muted);
  margin-bottom: var(--acu-space-2);
  letter-spacing: 0.02em;
}

.acu-followup-loading {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.acu-followup-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--acu-primary);
  animation: acu-followup-bounce 1.2s infinite ease-in-out both;
  &:nth-child(1) {
    animation-delay: -0.32s;
  }
  &:nth-child(2) {
    animation-delay: -0.16s;
  }
}

.acu-followup-list {
  display: flex;
  flex-direction: column;
  // 容器宽度跟随内容（按钮自身也自适应）
  width: fit-content;
  max-width: 100%;
  // 在 flex 列向下，子项不强制 stretch 满宽
  align-items: flex-start;
  gap: var(--acu-space-2);
}

.acu-followup-item {
  display: inline-flex;
  align-items: center;
  gap: var(--acu-space-3);
  padding: var(--acu-space-2-5) var(--acu-space-3-5);
  font-family: inherit;
  font-size: var(--acu-font-size-sm);
  color: var(--acu-text-secondary);
  background: var(--acu-bg);
  border: 1px solid var(--acu-border);
  border-radius: var(--acu-radius);
  cursor: pointer;
  text-align: left;
  // 跟随内容自适宽度，但不超过 list 容器
  width: auto;
  max-width: 100%;
  transition: color var(--acu-duration) var(--acu-easing),
    background-color var(--acu-duration) var(--acu-easing),
    border-color var(--acu-duration) var(--acu-easing),
    transform var(--acu-duration) var(--acu-easing);
  @include acu-focus-ring;

  &:hover {
    color: var(--acu-primary);
    background: var(--acu-primary-soft);
    border-color: var(--acu-primary);

    .acu-followup-item-arrow {
      color: var(--acu-primary);
      transform: translate(2px, -2px);
    }
  }

  &:active {
    background: var(--acu-primary-soft-hover);
    transform: translateY(0.5px);
  }
}

.acu-followup-item-label {
  // 文字单行展示自然撑开；过长时省略号而不是撑爆容器
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 540px;
}

.acu-followup-item-arrow {
  flex-shrink: 0;
  color: var(--acu-text-muted);
  transition: transform var(--acu-duration) var(--acu-easing),
    color var(--acu-duration) var(--acu-easing);
}

@keyframes acu-followup-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes acu-followup-bounce {
  0%,
  80%,
  100% {
    transform: scale(0.6);
    opacity: 0.4;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .acu-followup {
    animation: none;
  }
}
</style>
