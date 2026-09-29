<template>
  <!--
    开场白 + 预设问题。
    无消息时居中展示，点击预设问题触发发送。
  -->
  <div class="acu-welcome">
    <div class="acu-welcome-inner" :style="{ maxWidth: innerMaxWidth }">
      <div class="acu-welcome-logo">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
          <path d="M19 14l.8 1.9L21.7 17l-1.9.8L19 19.7l-.8-1.9L16.3 17l1.9-.8L19 14z" />
          <path d="M5 15l.6 1.5L7.1 17l-1.5.6L5 19.1l-.6-1.5L2.9 17l1.5-.6L5 15z" />
        </svg>
      </div>

      <h2 class="acu-welcome-title">{{ title }}</h2>
      <p v-if="description" class="acu-welcome-desc">{{ description }}</p>

      <div v-if="questions.length" class="acu-welcome-grid">
        <button
          v-for="q in questions"
          :key="q.id"
          type="button"
          class="acu-preset-q"
          @click="$emit('select', q)"
        >
          <span class="acu-preset-q-body">
            <span class="acu-preset-q-label">{{ q.label }}</span>
            <span v-if="q.prompt" class="acu-preset-q-prompt">{{ q.prompt }}</span>
          </span>
          <svg class="acu-preset-q-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PresetQuestion } from '@/types'

const props = withDefaults(
  defineProps<{
    title?: string
    description?: string
    questions?: PresetQuestion[]
    /**
     * 内容区最大宽度。数字按 px 处理，字符串原样使用（`'900px'` / `'60ch'` / `'100%'`）。
     *
     * 默认 `'var(--acu-max-width)'`——跟消息列表、输入框同一列（默认
     * `min(100%, 920px)`：窄容器跟随容器，宽屏截断居中）。用令牌而不是写死
     * 数值，`ChatContainer` 传进来的 `maxWidth` 会自动生效，三列不会各走各的。
     * @default 'var(--acu-max-width)'
     */
    maxWidth?: string | number
  }>(),
  {
    title: '你好，有什么可以帮你？',
    description: '试着问我任何问题，或选择下方的话题开始对话。',
    questions: () => [],
    maxWidth: 'var(--acu-max-width)'
  }
)

/** 数字补 px，字符串原样——让 `:max-width="900"` 和 `max-width="900px"` 都成立 */
const innerMaxWidth = computed(() =>
  typeof props.maxWidth === 'number' ? `${props.maxWidth}px` : props.maxWidth
)

defineEmits<{
  (e: 'select', question: PresetQuestion): void
}>()
</script>

<style lang="scss" scoped>
.acu-welcome {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  // 左右 padding 交给 .acu-welcome-inner：大屏下内容列被 --acu-max-width 截断
  // 居中后，padding 留在外层会让开场白比消息列表/输入框宽出两个 padding，
  // 三列左边缘差 16px，一眼看得出来对不齐
  padding: var(--acu-space-8) 0;
  min-height: 0;
}

.acu-welcome-inner {
  width: 100%;
  // max-width 由 maxWidth prop 通过 inline style 提供（默认 var(--acu-max-width)），
  // 写死在这里会盖不住 inline 之前的默认值——统一交给 prop 一处管理
  box-sizing: border-box;
  padding: 0 var(--acu-space-4);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  // 空态入场：轻微上浮淡入，比「整块突然出现」柔和。
  // 不使用 animation-fill-mode: both 之外的花样——base.scss 的
  // prefers-reduced-motion 规则会把时长压到 0.01ms，本动画自动失效。
  animation: acu-welcome-in 0.36s var(--acu-easing) both;
}

@keyframes acu-welcome-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.acu-welcome-logo {
  width: 56px;
  height: 56px;
  border-radius: var(--acu-radius-lg);
  // 原来是 primary-soft → surface 的 135° 渐变 + 一层投影。渐变的两个端点明度
  // 几乎一样，实际只是让色块「脏」了一点；换成单色淡底 + 品牌色图标，更干净，
  // 也更符合空态该有的安静。
  background: var(--acu-primary-soft);
  color: var(--acu-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--acu-space-5);
}

.acu-welcome-title {
  font-size: var(--acu-font-size-2xl);
  font-weight: 650;
  color: var(--acu-text);
  margin: 0 0 var(--acu-space-2);
  letter-spacing: -0.01em;
}

.acu-welcome-desc {
  font-size: var(--acu-font-size-md);
  color: var(--acu-text-secondary);
  margin: 0 0 var(--acu-space-6);
  max-width: 440px;
}

.acu-welcome-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--acu-space-3);

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
}

.acu-preset-q {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--acu-space-3);
  padding: var(--acu-space-4);
  text-align: left;
  background: var(--acu-surface);
  border: 1px solid var(--acu-border);
  border-radius: var(--acu-radius);
  cursor: pointer;
  font-family: inherit;
  transition: border-color var(--acu-duration) var(--acu-easing),
    background-color var(--acu-duration) var(--acu-easing),
    box-shadow var(--acu-duration) var(--acu-easing),
    transform var(--acu-duration) var(--acu-easing);
  @include acu-focus-ring;

  // 预设问题个数是奇数时（比如 9 个），双列网格右下角会空出一格 —— 一整块空白
  // 让卡片区看起来「少了点什么」。让孤零零的最后一张横跨两列补上。
  // 纯 CSS 判定（最后一个是奇数位），加减预设问题都不需要改代码。
  &:last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }

  &:hover {
    border-color: var(--acu-primary);
    background: var(--acu-primary-soft);
    transform: translateY(-1px);
    box-shadow: var(--acu-shadow-sm);

    .acu-preset-q-arrow {
      color: var(--acu-primary);
      transform: translate(2px, -2px);
    }
  }

  // 按下回收：hover 抬起 1px，按下落回 0，手感上有「按下去」的闭合
  &:active {
    transform: translateY(0);
    box-shadow: none;
  }
}

.acu-preset-q-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.acu-preset-q-label {
  font-size: var(--acu-font-size-md);
  font-weight: 550;
  color: var(--acu-text);
}

.acu-preset-q-prompt {
  font-size: var(--acu-font-size-xs);
  color: var(--acu-text-muted);
  @include acu-ellipsis(2);
}

.acu-preset-q-arrow {
  flex-shrink: 0;
  color: var(--acu-text-muted);
  transition: transform var(--acu-duration) var(--acu-easing),
    color var(--acu-duration) var(--acu-easing);
  margin-top: 2px;
}
</style>
