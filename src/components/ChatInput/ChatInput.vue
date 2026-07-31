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
        <div v-if="f.preview" class="acu-input-att-thumb">
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

      <button
        type="button"
        class="acu-input-send"
        :disabled="!canSend || disabled"
        aria-label="发送"
        @click="onSend"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import type { SelectedFile, UploadConfig } from '@/types'
import { uid, isImageType } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    placeholder?: string
    disabled?: boolean
    uploadConfig?: Partial<UploadConfig>
    maxLength?: number
  }>(),
  {
    placeholder: '输入消息，Enter 发送，Shift+Enter 换行',
    disabled: false,
    uploadConfig: () => ({}),
    maxLength: 4000
  }
)

const emit = defineEmits<{
  (e: 'send', payload: { text: string; files: SelectedFile[] }): void
}>()

const draft = ref('')
const pendingFiles = ref<SelectedFile[]>([])
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const isComposing = ref(false)
let dragCounter = 0

const uploadConfig = computed<UploadConfig>(() => ({
  enabled: true,
  multiple: true,
  accept: '',
  maxCount: 10,
  maxSize: 20 * 1024 * 1024,
  ...props.uploadConfig
}))

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

// —— 发送 ——
function onSend() {
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
  background: var(--acu-surface);
  border: 1px solid var(--acu-border);
  border-radius: var(--acu-radius-lg);
  padding: var(--acu-space-2);
  transition: border-color var(--acu-duration) var(--acu-easing),
    box-shadow var(--acu-duration) var(--acu-easing),
    background-color var(--acu-duration) var(--acu-easing);

  &:focus-within {
    border-color: var(--acu-primary);
    box-shadow: 0 0 0 3px var(--acu-primary-soft);
  }

  &.is-dragging {
    border-color: var(--acu-primary);
    background: var(--acu-primary-soft);
    box-shadow: 0 0 0 3px var(--acu-primary-soft);
  }

  &.is-disabled {
    opacity: 0.6;
    pointer-events: none;
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
}

.acu-input-row {
  display: flex;
  align-items: flex-end;
  gap: var(--acu-space-2);
  padding: var(--acu-space-1) var(--acu-space-1) 0;
}

.acu-input-icon-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--acu-text-muted);
  border-radius: var(--acu-radius-sm);
  cursor: pointer;
  transition: all var(--acu-duration-fast) var(--acu-easing);
  @include acu-focus-ring;
  &:hover:not(:disabled) {
    background: var(--acu-surface-2);
    color: var(--acu-text);
  }
}

.acu-input-file {
  display: none;
}

.acu-input-textarea {
  flex: 1;
  min-height: 36px;
  max-height: 200px;
  padding: 8px 4px;
  border: none;
  background: transparent;
  resize: none;
  font-family: inherit;
  font-size: var(--acu-font-size-md);
  line-height: 1.5;
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
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--acu-primary);
  color: var(--acu-primary-contrast);
  border-radius: var(--acu-radius-sm);
  cursor: pointer;
  transition: all var(--acu-duration-fast) var(--acu-easing);
  @include acu-focus-ring;
  &:hover:not(:disabled) {
    background: var(--acu-primary-hover);
  }
  &:active:not(:disabled) {
    background: var(--acu-primary-active);
  }
  &:disabled {
    background: var(--acu-surface-2);
    color: var(--acu-text-muted);
    cursor: not-allowed;
  }
}
</style>
