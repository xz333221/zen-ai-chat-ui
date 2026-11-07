<template>
  <!--
    文件改动抽屉：右侧滑出，展示单个文件的完整 diff。

    为什么是抽屉而不是就地展开：
      会话末尾的清单可能有十几个文件，就地展开会把对话流越推越长 ——
      用户想看的那一份 diff 反而被挤到屏幕外。抽屉固定在右侧、
      高度吃满视口，正文自己滚，对话区的滚动位置不动。

    Teleport 到 body：抽屉要盖住整个面板（含宿主的输入区 / 侧栏），
    留在消息列表里会被 overflow 裁掉。也因此必须自己带 `.acu-root`
    与 `data-theme` —— 离开 .acu-root 子树后就吃不到主题令牌了。
  -->
  <Teleport to="body">
    <transition name="acu-drawer">
      <div
        v-if="open"
        class="acu-root acu-drawer-scrim"
        :data-theme="theme"
        @click.stop="onScrimClick"
        @mousedown.stop
        @mouseup.stop
      >
        <aside
          ref="panelRef"
          class="acu-drawer"
          role="dialog"
          aria-modal="true"
          :aria-label="`${text.title} · ${change?.path ?? ''}`"
        >
          <header class="acu-drawer-head">
            <div class="acu-drawer-heading">
              <span class="acu-drawer-path" :title="change?.path">
                <span class="acu-drawer-dir">{{ parts.dir }}</span><span class="acu-drawer-name">{{ parts.base }}</span>
              </span>
              <span class="acu-drawer-meta">
                <span v-if="kindHint" class="acu-drawer-kind">{{ kindHint }}</span>
                <span v-if="change?.added" class="acu-drawer-added" :title="text.added">+{{ change.added }}</span>
                <span v-if="change?.removed" class="acu-drawer-removed" :title="text.removed">−{{ change.removed }}</span>
              </span>
            </div>
            <button
              ref="closeRef"
              type="button"
              class="acu-drawer-close"
              :aria-label="text.close"
              :title="`${text.close}（Esc）`"
              @click="close"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>

          <div class="acu-drawer-body">
            <FileChangeDiff :patch="change?.patch" :path="change?.path" :labels="labels" />
          </div>
        </aside>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { FileChange, FileChangeLabels, ThemeMode } from '@/types'
import { splitFilePath } from '@/utils/diff'
import FileChangeDiff from '@/components/FileChangeDiff/FileChangeDiff.vue'

const props = withDefaults(
  defineProps<{
    /** 是否打开 */
    open: boolean
    /** 要展示的文件改动 */
    change?: FileChange | null
    /** 文案覆盖 */
    labels?: FileChangeLabels
    /** 深浅色（Teleport 之后脱离 .acu-root，得由调用方从原位置读出来传进来） */
    theme?: ThemeMode
  }>(),
  { change: null, labels: undefined, theme: 'light' }
)

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const text = computed(() => ({
  title: props.labels?.title ?? '文件改动',
  added: props.labels?.added ?? '新增',
  removed: props.labels?.removed ?? '删除',
  writeHint: props.labels?.writeHint ?? '整体写入',
  close: props.labels?.close ?? '关闭'
}))

const parts = computed(() => splitFilePath(props.change?.path ?? ''))

/** 整文件写入不是 diff，单独标一下，别让人把满屏绿色读成「改了很多行」 */
const kindHint = computed(() => {
  const kind = props.change?.kind
  return kind === 'write' || kind === 'create' ? text.value.writeHint : ''
})

const panelRef = ref<HTMLElement | null>(null)
const closeRef = ref<HTMLElement | null>(null)
/** 打开前的焦点，关闭后还回去（键盘用户不该被扔回页面顶部） */
let lastFocused: HTMLElement | null = null
let bodyOverflow = ''

function close() {
  emit('update:open', false)
}

/** 点遮罩（抽屉外的空白）关闭；抽屉内部的点击只做「不外传」 */
function onScrimClick(event: MouseEvent) {
  if (event.target === event.currentTarget) close()
}

/**
 * Esc 关闭。
 *
 * 为什么用 window 的**捕获**阶段 + stopPropagation：
 * 宿主常有「Esc 关掉整个对话面板 / 弹层」的全局热键（zen-gitsync 的悬浮 dock 就是），
 * 冒泡阶段注册的话它会先于我们跑 —— 用户按一下 Esc，抽屉和宿主面板一起消失。
 * 捕获阶段拿到事件后拦下来，这次 Esc 就只归抽屉。
 */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  close()
}

watch(
  () => props.open,
  (open) => {
    if (typeof document === 'undefined') return
    if (open) {
      lastFocused = document.activeElement as HTMLElement | null
      bodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', onKeydown, true)
      nextTick(() => closeRef.value?.focus())
    } else {
      document.body.style.overflow = bodyOverflow
      window.removeEventListener('keydown', onKeydown, true)
      lastFocused?.focus?.()
      lastFocused = null
    }
  }
)

onBeforeUnmount(() => {
  if (typeof document === 'undefined') return
  window.removeEventListener('keydown', onKeydown, true)
  // 卸载时抽屉还开着（例如切换会话把整块清掉）也要把滚动条还回去
  if (props.open) document.body.style.overflow = bodyOverflow
})
</script>

<style lang="scss" scoped>
.acu-drawer-scrim {
  position: fixed;
  inset: 0;
  z-index: 2400;
  display: flex;
  justify-content: flex-end;
  background: rgba(16, 16, 24, 0.32);
}

.acu-drawer {
  display: flex;
  flex-direction: column;
  width: min(880px, 92vw);
  height: 100%;
  // 抽屉靠「白色面板 + 一条左缘」立住，不做圆角卡片那套
  background: var(--acu-bg);
  border-left: 1px solid var(--acu-border);
  box-shadow: -12px 0 40px rgba(16, 16, 24, 0.18);
  color: var(--acu-text);
}

.acu-drawer-head {
  display: flex;
  align-items: center;
  gap: var(--acu-space-3);
  flex: none;
  padding: var(--acu-space-3) var(--acu-space-4);
  border-bottom: 1px solid var(--acu-border);
}

.acu-drawer-heading {
  display: flex;
  align-items: baseline;
  gap: var(--acu-space-3);
  min-width: 0;
  flex: 1;
}

.acu-drawer-path {
  min-width: 0;
  font-family: var(--acu-font-mono);
  font-size: var(--acu-font-size-sm);
  @include acu-ellipsis(1);
}

.acu-drawer-dir {
  color: var(--acu-text-muted);
}

.acu-drawer-name {
  color: var(--acu-text);
  font-weight: 600;
}

.acu-drawer-meta {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--acu-space-2);
  font-family: var(--acu-font-mono);
  font-size: var(--acu-font-size-2xs);
}

.acu-drawer-kind {
  padding: 0 5px;
  border-radius: 3px;
  background: var(--acu-surface-2);
  color: var(--acu-text-muted);
  line-height: 17px;
}

.acu-drawer-added {
  color: var(--acu-success);
}

.acu-drawer-removed {
  color: var(--acu-error);
}

.acu-drawer-close {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--acu-radius-xs);
  background: transparent;
  color: var(--acu-text-muted);
  cursor: pointer;
  transition: background var(--acu-duration-fast) var(--acu-easing),
    color var(--acu-duration-fast) var(--acu-easing);
  @include acu-focus-ring;

  &:hover {
    background: var(--acu-surface-hover);
    color: var(--acu-text);
  }
}

.acu-drawer-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--acu-code-bg);
  @include acu-scrollbar(8px);
}

// —— 进出场 ——
.acu-drawer-enter-active,
.acu-drawer-leave-active {
  transition: opacity var(--acu-duration) var(--acu-easing);

  .acu-drawer {
    transition: transform var(--acu-duration) var(--acu-easing);
  }
}

.acu-drawer-enter-from,
.acu-drawer-leave-to {
  opacity: 0;

  .acu-drawer {
    transform: translateX(100%);
  }
}
</style>
