<template>
  <!--
    输入框：自适应高度 textarea + 附件上传（按钮 / 拖拽）+ 预览 + 发送。
    - Enter 发送，Shift+Enter 换行；中文输入法 composing 期间不触发
    - 附件：图片生成缩略图，其他显示文件卡片，可移除
    - 拖拽文件进入高亮
  -->
  <div
    class="acu-input-wrap"
    :class="{ 'is-dragging': isDragging, 'is-disabled': disabled }"
    @dragenter="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- 拖拽提示遮罩 -->
    <div v-if="isDragging" class="acu-input-drop-hint">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <span>松开以添加文件</span>
    </div>

    <!-- 附件预览 -->
    <div v-if="pendingFiles.length" class="acu-input-attachments">
      <div v-for="f in pendingFiles" :key="f.id" class="acu-input-att">
        <!-- 图片可点开看大图；用 role+tabindex 而不是 <button>，
             免得为了重置按钮默认样式把这里已有的尺寸/圆角规则全改一遍 -->
        <div
          v-if="f.preview"
          class="acu-input-att-thumb"
          role="button"
          tabindex="0"
          :aria-label="`预览 ${f.file.name}`"
          :title="`点击预览 ${f.file.name}`"
          @click="openPreview(f)"
          @keydown.enter.prevent="openPreview(f)"
          @keydown.space.prevent="openPreview(f)"
        >
          <img :src="f.preview" :alt="f.file.name" />
        </div>
        <div v-else class="acu-input-att-file">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          <span class="acu-input-att-name" :title="f.file.name">{{ f.file.name }}</span>
        </div>
        <button type="button" class="acu-input-att-remove" aria-label="移除" @click="removeFile(f.id)">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>

        <!-- 图片预览灯箱（点缩略图打开） -->
    <ImagePreview
      v-model:visible="previewVisible"
      v-model:index="previewIndex"
      :images="previewImages"
    />

    <div class="acu-input-row">
      <button
        v-if="uploadEnabled"
        type="button"
        class="acu-input-icon-btn"
        :disabled="disabled"
        aria-label="添加附件"
        @click="triggerFileInput"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </button>
      <input
        ref="fileInputRef"
        type="file"
        class="acu-input-file"
        :accept="uploadConfig.accept"
        :multiple="uploadConfig.multiple"
        @change="onFileChange"
      />

      <textarea
        ref="textareaRef"
        v-model="draft"
        class="acu-input-textarea"
        :placeholder="placeholder"
        :rows="1"
        :disabled="disabled"
        @keydown="onKeydown"
        @input="autoResize"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
        @paste="onPaste"
      ></textarea>

      <!--
        上下文占用：发送按钮左侧的圆环，深色弧长表示占比；**hover 圆环**才出气泡。
        形态参考 WorkBuddy（2026-10-07 量得：直径约 50px、浅灰底 rgb(242,242,242)、
        弧色偏蓝灰、气泡浮在上方且尖角正指圆环）。
        为什么圆环常显、气泡 hover 才出：圆环是"随时可查的状态"，气泡是"要读的数字"，
        两者混在一起会让输入框上方长期挂一块深色。
        tabindex="0" 让键盘用户能聚焦并读到数字（纯 hover 键盘不可达）；
        焦点描边用 :has(:focus-visible) 单独给，鼠标点击不会留下永久描边。
      -->
      <div
        v-if="usageView"
        class="acu-input-usage"
        :class="`is-${usageView.level}`"
        role="img"
        :aria-label="usageView.summary"
        tabindex="0"
      >
        <span class="acu-input-usage-text" role="tooltip">{{ usageView.summary }}</span>
        <svg class="acu-input-usage-ring" viewBox="0 0 36 36" aria-hidden="true">
          <circle class="acu-input-usage-track" cx="18" cy="18" r="15" />
          <circle
            class="acu-input-usage-arc"
            cx="18" cy="18" r="15"
            :stroke-dasharray="usageView.dashArray"
          />
        </svg>
      </div>

      <button
        type="button"
        class="acu-input-send"
        :class="{ 'is-stop': generating }"
        :disabled="generating ? false : !canSend || disabled"
        :aria-label="generating ? '停止生成' : '发送'"
        :title="generating ? '停止生成' : '发送'"
        @click="onAction"
      >
        <!-- 生成中：方形「停止」图标；否则：向上箭头「发送」 -->
        <svg
          v-if="generating"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="6" y="6" width="12" height="12" rx="2.5" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import type { SelectedFile, UploadConfig, ContextUsage } from '@/types'
import { uid, isImageType } from '@/utils/format'
import ImagePreview from '@/components/ImagePreview/ImagePreview.vue'

const props = withDefaults(
  defineProps<{
    placeholder?: string
    disabled?: boolean
    /**
     * 是否正在生成。
     * 为 true 时右侧按钮由「发送」变为「停止」，点击抛出 stop 事件。
     * 和 disabled 相互独立：想同时禁用输入框就两个都传。
     */
    generating?: boolean
    uploadConfig?: Partial<UploadConfig>
    maxLength?: number
    /**
     * 上下文占用指示。不传则整条不渲染（且不占位，见模板里的 v-if）。
     *
     * 形状与语义见 `types/index.ts` 的 `ContextUsage` —— 一句话：**宿主算好
     * `{ ratio, current, total }` 传进来，库只负责排版与配色**。库不替你算
     * 占用率，因为那取决于业务口径（字符还是 token？两条预算取大者？provider
     * 报的真实用量还是本地估算？），写死一个口径等于逼每个宿主绕开它。
     */
    contextUsage?: ContextUsage | null
  }>(),
  {
    placeholder: '输入消息，Enter 发送，Shift+Enter 换行',
    disabled: false,
    generating: false,
    uploadConfig: () => ({}),
    maxLength: 4000,
    contextUsage: null
  }
)

const emit = defineEmits<{
  (e: 'send', payload: { text: string; files: SelectedFile[] }): void
  (e: 'stop'): void
}>()

const draft = ref('')
const pendingFiles = ref<SelectedFile[]>([])
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const isComposing = ref(false)
let dragCounter = 0

// —— 图片预览 —— //
const previewVisible = ref(false)
const previewIndex = ref(0)
/** 待发送附件里的图片，顺序与缩略图一致，支持左右切换 */
const previewImages = computed(() =>
  pendingFiles.value
    .filter((f) => !!f.preview)
    .map((f) => ({ src: f.preview as string, name: f.file.name }))
)

function openPreview(f: SelectedFile) {
  const idx = previewImages.value.findIndex((i) => i.src === f.preview)
  if (idx < 0) return
  previewIndex.value = idx
  previewVisible.value = true
}

const uploadConfig = computed<UploadConfig>(() => ({
  enabled: true,
  multiple: true,
  accept: '',
  maxCount: 10,
  maxSize: 20 * 1024 * 1024,
  ...props.uploadConfig
}))

// —— 上下文占用指示 —— //
/**
 * 数字按 unit 决定要不要除 1000。
 *
 * 为什么要库做这个而不是让宿主拼好字符串：`255.9K` / `1000.0K` 这种写法
 * 每个宿主都得自己写一遍除法与小数位，某处少个 0 就会显示成 `1000K`。
 * 传 `{ current: 255900, total: 1000000, unit: 'K' }` 由这里统一处理。
 */
function formatUsageValue(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const isK = /^K/i.test(props.contextUsage?.unit || '')
  const n = isK ? v / 1000 : v
  // K 档保留一位小数（255.9K），其余取整 —— 整数后面拖一堆小数是噪声
  return isK ? n.toFixed(1) : String(Math.round(n))
}

const usageView = computed(() => {
  const u = props.contextUsage
  if (!u) return null
  const ratio = Number.isFinite(u.ratio) ? u.ratio : 0
  const unit = u.unit || ''
  // 百分比**不夹取**：ratio 传 1.2 就显示 120%，超了要看得见 ——
  // 悄悄夹到 100% 会把宿主的计算 bug 藏起来
  const percent = ratio * 100
  const level = u.level || (ratio >= 1 ? 'full' : ratio >= 0.8 ? 'warn' : 'normal')
  const summary =
    `${percent.toFixed(1)}% · ${formatUsageValue(u.current)}${unit}` +
    ` / ${formatUsageValue(u.total)}${unit}` +
    (u.suffix ? ` ${u.suffix}` : '')
  // 圆环周长（viewBox 36、r=15）→ 弧长。**用 stroke-dasharray 而不是 conic-gradient**：
  // SVG 描边天生就是圆弧，conic 要靠 mask 挖中心、还得算两段渐变角度。
  const circumference = 2 * Math.PI * 15
  // 夹到 [0,1] 再算弧：ratio > 1 时画满整圈（周长），文字仍显示真实百分比
  const clamped = Math.min(Math.max(ratio, 0), 1)
  return {
    level,
    summary,
    detail: u.detail || summary,
    dashArray: `${(circumference * clamped).toFixed(2)} ${circumference.toFixed(2)}`
  }
})

const uploadEnabled = computed(() => uploadConfig.value.enabled)

const canSend = computed(
  () => draft.value.trim().length > 0 || pendingFiles.value.length > 0
)

// —— 文本输入 ——
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !isComposing.value && !e.isComposing) {
    e.preventDefault()
    onSend()
  }
}
function onCompositionStart() {
  isComposing.value = true
}
function onCompositionEnd() {
  isComposing.value = false
}

function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  const max = 200
  el.style.height = Math.min(el.scrollHeight, max) + 'px'
  el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
}

// —— 右侧按钮：生成中 = 停止，否则 = 发送 ——
function onAction() {
  if (props.generating) {
    // 生成中：只发停止信号，不动草稿（用户可能已经写好下一条了）
    emit('stop')
    return
  }
  onSend()
}

// —— 发送 ——
function onSend() {
  // 生成中即使输入框没被 disabled，也不允许再次发送（Enter 走到这里会被拦下）
  if (props.generating) return
  if (!canSend.value || props.disabled) return
  const text = draft.value.trim()
  if (!text && pendingFiles.value.length === 0) return
  emit('send', { text, files: [...pendingFiles.value] })
  draft.value = ''
  pendingFiles.value = []
  nextTick(() => {
    autoResize()
    textareaRef.value?.focus()
  })
}

// —— 附件 ——
function triggerFileInput() {
  fileInputRef.value?.click()
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) addFiles(Array.from(input.files))
  input.value = '' // 允许重复选择同一文件
}

function addFiles(files: File[]) {
  const cfg = uploadConfig.value
  for (const file of files) {
    if (cfg.maxCount && pendingFiles.value.length >= cfg.maxCount) break
    if (cfg.maxSize && file.size > cfg.maxSize) continue
    const item: SelectedFile = { file, id: uid('file') }
    if (isImageType(file.type)) {
      item.preview = URL.createObjectURL(file)
    }
    pendingFiles.value.push(item)
  }
}

function removeFile(id: string) {
  const idx = pendingFiles.value.findIndex((f) => f.id === id)
  if (idx >= 0) {
    const f = pendingFiles.value[idx]
    if (f.preview) URL.revokeObjectURL(f.preview)
    pendingFiles.value.splice(idx, 1)
  }
}

// —— 粘贴 ——
function onPaste(e: ClipboardEvent) {
  if (props.disabled || !uploadEnabled.value) return
  const items = e.clipboardData?.items
  if (!items || items.length === 0) return
  const files: File[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  if (files.length === 0) return
  e.preventDefault()
  addFiles(files)
}

// —— 拖拽 ——
function onDragEnter(e: DragEvent) {
  if (props.disabled || !uploadEnabled.value) return
  if (!e.dataTransfer?.types.includes('Files')) return
  dragCounter++
  isDragging.value = true
}
function onDragLeave() {
  dragCounter = Math.max(0, dragCounter - 1)
  if (dragCounter === 0) isDragging.value = false
}
function onDrop(e: DragEvent) {
  dragCounter = 0
  isDragging.value = false
  if (props.disabled || !uploadEnabled.value) return
  const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : []
  if (files.length) addFiles(files)
}

onMounted(() => autoResize())

defineExpose({
  focus: () => textareaRef.value?.focus(),
  clear: () => {
    draft.value = ''
    pendingFiles.value = []
    nextTick(autoResize)
  }
})
</script>

<style lang="scss" scoped>
.acu-input-wrap {
  position: relative;
  max-width: var(--acu-max-width);
  width: 100%;
  margin: 0 auto;
  // 白底 + 描边 + 一层极淡阴影，而不是 --acu-surface 灰底：灰底在白页面上
  // 是一块「填色」，白底描边才像一张轻轻浮起来的卡片，视觉重量低得多。
  background: var(--acu-bg);
  border: 1px solid var(--acu-border);
  border-radius: var(--acu-radius-lg);
  padding: var(--acu-space-2);
  box-shadow: var(--acu-shadow-sm);
  transition: border-color var(--acu-duration) var(--acu-easing),
    box-shadow var(--acu-duration) var(--acu-easing),
    background-color var(--acu-duration) var(--acu-easing);

  &:focus-within {
    border-color: var(--acu-primary);
    // 叠上卡片本身那层阴影，否则聚焦瞬间「浮起来」的感觉会掉下去、像塌了一下
    box-shadow: 0 0 0 3px var(--acu-primary-soft), var(--acu-shadow-sm);
  }

  &.is-dragging {
    border-color: var(--acu-primary);
    background: var(--acu-primary-soft);
    box-shadow: 0 0 0 3px var(--acu-primary-soft);
  }

  &.is-disabled {
    opacity: 0.6;
    pointer-events: none;

    // disabled + generating 是文档里支持的组合（锁住输入框、按钮变停止）：
    // 停止按钮必须还能点，否则生成中就永远停不下来。
    .acu-input-send.is-stop {
      pointer-events: auto;
    }
  }
}

.acu-input-drop-hint {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--acu-space-2);
  color: var(--acu-primary);
  font-size: var(--acu-font-size-sm);
  font-weight: 500;
  pointer-events: none;
  z-index: 1;
}

.acu-input-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: var(--acu-space-2);
  padding: var(--acu-space-2) var(--acu-space-2) 0;
}

/*
  上下文占用：输入框底部的一条状态行。
  左窄右宽的两段式 —— 进度条 + 百分比/用量文字。同一条线既给"比例"也给"绝对量"，
  因为两者回答的是不同问题：比例回答"还剩多少"，绝对量回答"现在到底带了多少"。
  只给其中一个都会让人不放心：只有百分比，100% 是 400 字符还是 400k 字符看不出来；
  只有绝对量，剩多少空间要自己算。
*/
/*
  上下文占用：**发送按钮左侧的圆环**，深色弧长 = 占比；hover（或键盘聚焦）时上方浮气泡。
  形态按 WorkBuddy 实测还原（2026-10-07 从截图量得）：
    · 圆环显示直径 26px（viewBox 36，缩放渲染），浅灰底 rgb(242,242,242)
    · 弧色偏蓝灰，从**正上方 12 点顺时针**填充 —— 与 convic 图标类指示器同一起点
    · 气泡 221×28、圆角 ≈8px、底色 rgb(68,70,98)，尖角高 4px 底宽 6px 正指圆环

  为什么圆环常显、气泡 hover 才出：圆环是"随时可查的状态灯"，气泡是"要读的精确数字"。
  两者都常显会在输入框上方长期挂一块深色，喧宾夺主且挡住对话。
  键盘可达性：圆环给 tabindex="0"，`:focus-within` 让 Tab 聚焦时也能看到气泡
  （纯 hover 的话键盘用户永远读不到这个数字）。
  ⚠️ 焦点环用 `:has(:focus-visible)` 单独给 —— **不要**写成
  `.acu-input-usage:focus-within { box-shadow }`：那样鼠标点一下圆环、
  焦点留在上面，描边就永久留住了（实测踩过，`InstanceSwitcher` 就因此把
  hover 态写成了永久高亮）。`:focus-visible` 只在键盘操作时匹配，鼠标点击不触发。
*/
.acu-input-usage {
  position: relative;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  border-radius: 50%;
  /* 键盘聚焦时才给一圈描边，鼠标 hover 不给 —— 否则每次移上去输入框里多一个框 */
  outline: none;
}
.acu-input-usage:has(.acu-input-usage-ring:focus-visible) {
  box-shadow: 0 0 0 2px var(--acu-bg), 0 0 0 4px var(--acu-primary);
}

/*
  显示尺寸 26px，**viewBox 仍是 36** —— 两者解耦，所以 dashArray 的周长计算
  （基于 viewBox 里的 r=15）完全不用动。改小只是缩放渲染，不影响弧长比例。
  26px 与相邻 34px 的附件按钮差一档：圆环是状态灯，不需要和主按钮同权重，
  太大反而会让人以为那里能点。
*/
.acu-input-usage-ring {
  width: 26px;
  height: 26px;
  transform: rotate(-90deg);   /* 让 stroke 从 12 点开始顺时针走 */
}

.acu-input-usage-track {
  fill: none;
  stroke: var(--acu-surface-hover, #f1f2f6);
  stroke-width: 3;
}

.acu-input-usage-arc {
  fill: none;
  stroke: var(--acu-text-muted);   /* 深蓝灰，与参考图一致 */
  stroke-width: 3;
  stroke-linecap: round;
  transition: stroke-dasharray 240ms var(--acu-easing, ease);
}

/*
  气泡：浮在圆环正上方，尖角正指圆环圆心。
  opacity/visibility 过渡而不是 display:none —— 元素一直在，
  hover 才显形；`pointer-events: none` 保证不挡鼠标。
*/
.acu-input-usage-text {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 4;
  height: 28px;
  display: inline-flex;
  align-items: center;
  padding: 0 14px;
  border-radius: 8px;
  background: #444262;
  color: #fff;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;   /* 占比每轮变，比例字体会让气泡抖 */
  opacity: 0;
  visibility: hidden;
  transition: opacity 140ms var(--acu-easing, ease);
  pointer-events: none;
}

/* 尖角：4px 高、6px 底宽，与气泡同色 */
.acu-input-usage-text::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -3px;
  border: 4px solid transparent;
  border-top-color: #444262;
  border-bottom: 0;
}

.acu-input-usage:hover .acu-input-usage-text,
.acu-input-usage:focus-within .acu-input-usage-text {
  opacity: 1;
  visibility: visible;
}

/*
  三档只改**弧与文字**的颜色，底色恒定 —— 圆环是固定的状态锚点，
  变底色会让它在输入框里"闪"一下，反而更难读当前状态。
*/
.acu-input-usage.is-warn .acu-input-usage-arc { stroke: var(--acu-warning); }
.acu-input-usage.is-warn .acu-input-usage-text { color: var(--acu-warning); }
.acu-input-usage.is-full .acu-input-usage-arc { stroke: #e5484d; }
.acu-input-usage.is-full .acu-input-usage-text { color: #ffb3b3; }

.acu-input-att {
  position: relative;
  display: inline-flex;
}

.acu-input-att-thumb {
  width: 56px;
  height: 56px;
  border-radius: var(--acu-radius-sm);
  overflow: hidden;
  border: 1px solid var(--acu-border);
  cursor: zoom-in;
  @include acu-focus-ring(1px);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.acu-input-att-file {
  display: inline-flex;
  align-items: center;
  gap: var(--acu-space-2);
  padding: var(--acu-space-2) var(--acu-space-3);
  background: var(--acu-bg);
  border: 1px solid var(--acu-border);
  border-radius: var(--acu-radius-sm);
  color: var(--acu-text-secondary);
  max-width: 180px;
}

.acu-input-att-name {
  font-size: var(--acu-font-size-xs);
  @include acu-ellipsis(1);
}

.acu-input-att-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--acu-radius-full);
  background: var(--acu-text);
  color: var(--acu-bg);
  cursor: pointer;
  box-shadow: var(--acu-shadow-sm);
  transition: transform var(--acu-duration-fast) var(--acu-easing);
  &:hover {
    transform: scale(1.12);
  }
  &:active {
    transform: scale(1.02);
  }
}

.acu-input-row {
  display: flex;
  align-items: flex-end;
  gap: var(--acu-space-2);
  padding: var(--acu-space-1) var(--acu-space-1) 0;
}

.acu-input-icon-btn {
  flex-shrink: 0;
  // 34px 圆形：容器圆角是 18px，里面再放 8px 圆角的方块会形成两套圆角语言，
  // 一眼看着「没对齐」。全圆是能和任意容器圆角和平共处的那一档。
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--acu-text-muted);
  border-radius: var(--acu-radius-full);
  cursor: pointer;
  transition: background-color var(--acu-duration-fast) var(--acu-easing),
    color var(--acu-duration-fast) var(--acu-easing);
  @include acu-focus-ring;
  &:hover:not(:disabled) {
    background: var(--acu-surface-2);
    color: var(--acu-text);
  }
  &:active:not(:disabled) {
    background: var(--acu-surface-hover);
  }
}

.acu-input-file {
  display: none;
}

.acu-input-textarea {
  flex: 1;
  min-height: 34px;
  max-height: 200px;
  padding: var(--acu-space-2) var(--acu-space-1);
  border: none;
  background: transparent;
  resize: none;
  font-family: inherit;
  font-size: var(--acu-font-size-md);
  line-height: var(--acu-line-height-tight);
  color: var(--acu-text);
  outline: none;
  @include acu-scrollbar(4px);

  &::placeholder {
    color: var(--acu-text-muted);
  }
  &:disabled {
    cursor: not-allowed;
  }
}

.acu-input-send {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--acu-primary);
  color: var(--acu-primary-contrast);
  // 与左侧图标按钮同为全圆，输入框右下角因此只有一个「圆」的收尾
  border-radius: var(--acu-radius-full);
  cursor: pointer;
  transition: background-color var(--acu-duration-fast) var(--acu-easing),
    color var(--acu-duration-fast) var(--acu-easing),
    transform var(--acu-duration-fast) var(--acu-easing);
  @include acu-focus-ring;
  &:hover:not(:disabled) {
    background: var(--acu-primary-hover);
  }
  &:active:not(:disabled) {
    background: var(--acu-primary-active);
    transform: scale(0.94);
  }
  &:disabled {
    background: var(--acu-surface-2);
    color: var(--acu-text-muted);
    cursor: not-allowed;
  }

  // 生成中：柔和的危险色，和实心主色的「发送」形成对比，
  // 又不至于像纯红实心那样抢眼（它只是个中止动作，不是提交）
  &.is-stop {
    background: var(--acu-error-soft);
    color: var(--acu-error);

    &:hover:not(:disabled) {
      background: var(--acu-error-soft-hover);
    }
    &:active:not(:disabled) {
      background: var(--acu-error-soft-hover);
    }
  }
}
</style>
