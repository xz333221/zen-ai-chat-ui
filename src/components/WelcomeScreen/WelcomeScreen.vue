<template>
  <!--
    开场白 + 预设问题。
    无消息时居中展示，点击预设问题触发发送。
  -->
  <div class="acu-welcome">
    <div class="acu-welcome-inner" :style="{ maxWidth: innerMaxWidth }">
      <div class="acu-welcome-logo">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
          <path d="M19 14l.8 1.9L21.7 17l-1.9.8L19 19.7l-.8-1.9L16.3 17l1.9-.8L19 14z" />
          <path d="M5 15l.6 1.5L7.1 17l-1.5.6L5 19.1l-.6-1.5L2.9 17l1.5-.6L5 15z" />
        </svg>
      </div>

      <h2 class="acu-welcome-title">{{ title }}</h2>
      <p v-if="description" class="acu-welcome-desc">{{ description }}</p>

      <div v-if="questions.length" class="acu-welcome-grid">
        <button
          v-for="(q, i) in questions"
          :key="q.id"
          type="button"
          class="acu-preset-q"
          @click="$emit('select', q)"
        >
          <!--
            序号：把「一堆并排的按钮」变成「一页目录」。
            aria-hidden —— 它是纯排版标记，念给读屏反而是噪音。
            补零到两位（01…09）是为了让数字等宽，序号列不会左右抖。
          -->
          <span class="acu-preset-q-index" aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>
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
  // 左右 16px 的 gutter 打在这一层（而不是 .acu-welcome-inner 上）：
  // inner 带 padding 会让「内容列」实际只有 max-width - 32 宽，而底部输入框
  // 的 gutter 是在 .acu-chat-footer 上的 —— 两边各算各的，卡片列和输入框
  // 左边缘就差了整整 16px。把 gutter 统一挪到外层，内容列即是 max-width 本身，
  // 与输入框的框线严丝合缝。
  // 窄容器下 100% - 32px 仍然生效，边距不会丢。
  padding: var(--acu-space-8) var(--acu-space-4);
  min-height: 0;
}

.acu-welcome-inner {
  width: 100%;
  // max-width 由 maxWidth prop 通过 inline style 提供（默认 var(--acu-max-width)），
  // 写死在这里会盖不住 inline 之前的默认值——统一交给 prop 一处管理
  box-sizing: border-box;
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
  // 试过「去掉底板、只留品牌色字形」：字形会孤零零飘在标题上方，整块失去锚点，
  // 比带底板更弱 —— 一个 26px 的细线图标撑不起 920px 的开场白区。
  // 所以保留底板，但收得更紧：48px 板配 26px 字形（字形占板 54%），
  // 比 52/24（46%）更「实」，也不再是那种松垮的大圆角牌。
  width: 48px;
  height: 48px;
  border-radius: var(--acu-radius-md);
  // 单色淡底 + 品牌色字形 + 一圈同色系 inset 细边。
  // （早先用的是 primary-soft → surface 的 135° 渐变，两端明度几乎一样，
  //   只是让色块「脏」了一点；换成单色更干净，也更符合空态该有的安静。）
  // 细边是必要的：只靠淡底，色块在近白页面上会「糊」开成一坨，
  // 有了边界它才是一枚徽标
  background: var(--acu-primary-soft);
  color: var(--acu-primary);
  box-shadow: inset 0 0 0 1px var(--acu-primary-soft-hover);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--acu-space-5);
}

.acu-welcome-title {
  font-size: var(--acu-font-size-3xl);
  // 600 而不是 650：数字字重只在可变字体上生效，系统字体下 650 会被就近
  // 取整成 600 或 700 —— 写 600 才能保证各平台落到同一档
  font-weight: 600;
  // 标题用自己那一档行高，不再继承正文的 1.65
  line-height: var(--acu-line-height-heading);
  color: var(--acu-text);
  // 6px：标题与描述是一个语义组，组内要贴紧。原来 8px 配 1.65 的行高，
  // 视觉上多出近 14px 空气，标题看着像「飘在半空」
  margin: 0 0 var(--acu-space-1-5);
  letter-spacing: -0.02em;
}

.acu-welcome-desc {
  font-size: var(--acu-font-size-base);
  line-height: var(--acu-line-height);
  color: var(--acu-text-secondary);
  // 32px：组间间距 ≈ 组内间隔(6px) 的 5 倍，分组关系一眼可辨 ——
  // 「标题+描述」是一块，「预设卡片区」是另一块
  margin: 0 0 var(--acu-space-8);
  max-width: 420px;
  // 两行描述在固定宽度下很容易断成「第一行塞满、第二行只剩三五个字」的尾行孤字
  // （演示文案实测断在「…或直 / 接输入消息。」）。balance 让两行长度接近，
  // 不支持该属性的引擎会原样忽略，退化成普通换行，不会更糟
  text-wrap: balance;
}

.acu-welcome-grid {
  width: 100%;
  display: grid;
  // auto-fit + minmax：列数由「容器能放下几个 280px」自己算，不写断点。
  // 920px 内容列下正好 3 列 —— 9 条预设刚好排成 3×3 的方阵。
  // 原来固定 2 列，9 条会剩一个孤格，于是靠 `:last-child:nth-child(odd)`
  // 让最后一张横跨两列去补洞；那条补丁在 3 列下反而会把第 9 张拉成全宽、
  // 破坏方阵（9 既是奇数也是 3 的倍数），所以随固定列数一起删掉了。
  // 换成 auto-fit 后，列数跟着容器走、孤格由网格自己处理，两个问题一起消失。
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--acu-space-3);
}

.acu-preset-q {
  display: flex;
  align-items: flex-start;
  gap: var(--acu-space-2-5);
  padding: var(--acu-space-4);
  text-align: left;
  // 白底 + 描边，而不是 --acu-surface 灰底：灰底在近白页面上是一块「填色」，
  // 九张并排就读成九格被禁用的表单域。卡片靠边界立住、不靠填色，
  // 视觉重量降一档，也才配得上旁边 26px 的标题
  background: var(--acu-card-bg);
  border: 1px solid var(--acu-card-border);
  border-radius: var(--acu-radius-md);
  cursor: pointer;
  font-family: inherit;
  transition: border-color var(--acu-duration) var(--acu-easing),
    box-shadow var(--acu-duration) var(--acu-easing),
    transform var(--acu-duration) var(--acu-easing);
  @include acu-focus-ring;

  // 悬停刻意「不变底色」：原来整块刷成 --acu-primary-soft，9 张卡里指到哪张
  // 就是一大片紫，是页面里最吵的动作。改成「描边加深 + 极淡投影 + 抬 1px」，
  // 唯一移动的颜色只有右上角那个箭头 —— 克制路数里，位移要留给焦点本身
  &:hover {
    border-color: var(--acu-card-border-hover);
    box-shadow: var(--acu-shadow-sm);
    transform: translateY(-1px);

    .acu-preset-q-arrow {
      color: var(--acu-primary);
      transform: translate(2px, -2px);
    }

    .acu-preset-q-index {
      color: var(--acu-text-secondary);
    }
  }

  // 按下回收：hover 抬起 1px，按下落回 0，手感上有「按下去」的闭合
  &:active {
    transform: translateY(0);
    box-shadow: none;
  }
}

// 序号列：让每张卡片的第一行从同一条竖线开始，扫视时不必逐行读文字。
// line-height 与 padding-top 是为了让 11px 的数字和 15px 的标题首行
// 在视觉中线上对齐（两者字号不同，靠 flex-start 对齐会偏上）
.acu-preset-q-index {
  flex-shrink: 0;
  font-size: var(--acu-font-size-2xs);
  line-height: var(--acu-line-height-tight);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  color: var(--acu-text-muted);
  padding-top: 3px;
  transition: color var(--acu-duration) var(--acu-easing);
  user-select: none;
}

.acu-preset-q-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.acu-preset-q-label {
  font-size: var(--acu-font-size-md);
  // 600（不是 550）：550 在非可变字体上会被就近取整，各平台落点不一致
  font-weight: 600;
  line-height: var(--acu-line-height-tight);
  color: var(--acu-text);
  @include acu-ellipsis(2);
}

.acu-preset-q-prompt {
  font-size: var(--acu-font-size-xs);
  line-height: var(--acu-line-height-tight);
  color: var(--acu-text-muted);
  @include acu-ellipsis(2);
  // 恒定占满两行高度（36px），哪怕正文只有一行。
  // 网格里最忌讳行高参差：9 张卡按内容自然撑高，会出现「前两行 78px、
  // 第三行 96px」这种每一行都不一样的效果。把这段空气固定在文本块内部，
  // 卡片高度就对所有条目一致，而不是靠给卡片写死 min-height ——
  // 后者在文案更长时会失效，前者的下限跟着字号令牌走，改字号也自动跟随
  min-height: calc(var(--acu-font-size-xs) * var(--acu-line-height-tight) * 2);
}

.acu-preset-q-arrow {
  flex-shrink: 0;
  color: var(--acu-text-muted);
  transition: transform var(--acu-duration) var(--acu-easing),
    color var(--acu-duration) var(--acu-easing);
  // 3px：把 16px 的箭头压到标题首行（15px × 1.5 = 22.5px 的行盒）的中线上。
  // 原来写 2px，箭头会略高于标题，九个箭头排成一列时这个 1px 一眼可见
  margin-top: 3px;
}
</style>
