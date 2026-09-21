<template>
  <!--
    图片预览灯箱。
    Teleport 到 body：附件缩略图常常处在 overflow:hidden / 窄容器里，
    留在原地会被裁掉，也没法盖住整屏。

    配色刻意写死成深色而不是跟随 --acu-* 变量：
    1) Teleport 之后脱离了 .acu-root[data-theme] 的作用域，变量取不到；
    2) 图片查看器用深底是通行做法（macOS 预览、Google Photos 都这样），
       深底不会影响对图片本身颜色的判断。
  -->
  <Teleport v-if="visible" to="body">
    <div
      class="acu-image-preview"
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      @click.self="close"
      @wheel.prevent
    >
      <img
        v-if="current"
        class="acu-image-preview-img"
        :src="current.src"
        :alt="current.name || ''"
        @click.stop
      />

      <button type="button" class="acu-ip-btn is-close" aria-label="关闭预览（Esc）" @click="close">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <template v-if="images.length > 1">
        <button type="button" class="acu-ip-btn is-prev" aria-label="上一张" @click.stop="step(-1)">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button type="button" class="acu-ip-btn is-next" aria-label="下一张" @click.stop="step(1)">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <div class="acu-ip-counter">{{ cursor + 1 }} / {{ images.length }}</div>
      </template>

      <div v-if="current?.name" class="acu-ip-name" :title="current.name">{{ current.name }}</div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { PreviewImage } from '@/types'

const props = withDefaults(
  defineProps<{
    /** 是否显示 */
    visible: boolean
    /** 可切换的图片列表 */
    images: PreviewImage[]
    /** 打开时定位到第几张 */
    index?: number
  }>(),
  { index: 0 }
)

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'update:index', v: number): void
}>()

const cursor = ref(0)
const current = computed(() => props.images[cursor.value])

// 打开时同步外部传入的起始下标；列表在外部被换掉时也兜住越界
watch(
  [() => props.visible, () => props.index, () => props.images.length],
  ([visible, index, len]) => {
    if (!visible) return
    cursor.value = len ? Math.min(Math.max(index, 0), len - 1) : 0
  },
  { immediate: true }
)

function step(delta: number) {
  const len = props.images.length
  if (len < 2) return
  // 循环切换：从最后一张再往后回到第一张
  cursor.value = (cursor.value + delta + len) % len
  emit('update:index', cursor.value)
}

function close() {
  emit('update:visible', false)
}

function onKeydown(e: KeyboardEvent) {
  if (!props.visible) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    step(-1)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    step(1)
  }
}

// 只在打开期间挂 window 监听，避免每条消息都留一个常驻监听
watch(
  () => props.visible,
  (visible) => {
    if (typeof window === 'undefined') return
    if (visible) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown)
})
</script>

<style lang="scss" scoped>
.acu-image-preview {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 56px 64px;
  background: rgba(9, 9, 11, 0.88);
  backdrop-filter: blur(3px);
  animation: acu-ip-in 0.16s ease-out;
  // 灯箱自己不该被滚动带走
  overscroll-behavior: contain;
}

@keyframes acu-ip-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.acu-image-preview-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 6px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
  // 图片本体可点（不关闭），但光标给个提示
  cursor: default;
}

.acu-ip-btn {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: #fafafa;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.24);
  }

  &:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.7);
    outline-offset: 2px;
  }

  svg {
    flex-shrink: 0;
  }

  &.is-close {
    top: 16px;
    right: 16px;
    width: 36px;
    height: 36px;
  }

  &.is-prev,
  &.is-next {
    top: 50%;
    width: 40px;
    height: 40px;
    transform: translateY(-50%);
  }

  &.is-prev {
    left: 16px;
  }

  &.is-next {
    right: 16px;
  }
}

.acu-ip-counter,
.acu-ip-name {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  max-width: min(70vw, 560px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
  user-select: none;
}

.acu-ip-counter {
  top: 24px;
  font-variant-numeric: tabular-nums;
}

.acu-ip-name {
  bottom: 22px;
}
</style>
