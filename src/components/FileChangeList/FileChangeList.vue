<template>
  <!--
    文件改动清单：这一轮（一条 assistant 消息）到底动了哪些文件。

    为什么单独做一块，而不是塞进工具调用行：
      - 工具调用是「过程」，一条消息里可能有十几个，折叠组只显示最后一个；
        用户想知道的是「结果改了啥」，这个信息不该藏在折叠里。
      - 每个文件一行、带增删行数，点开看 diff —— 一眼扫完，不用逐条展开 JSON。

    数据来自各条工具调用的参数（`collectFileChanges`），所以流式与历史回放同一口径。
    样式走平铺：没有圆角描边卡片，行 hover 才出底色。
  -->
  <div v-if="changes.length" class="acu-filechanges">
    <div class="acu-filechanges-head">
      <span class="acu-filechanges-icon">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </span>
      <span class="acu-filechanges-title">{{ text.title }}</span>
      <span class="acu-filechanges-count">{{ changes.length }} {{ text.files }}</span>
      <!-- 只有 1 个文件时不重复一遍合计：下面那行已经写着同样的 +3 −2 -->
      <span v-if="changes.length > 1" class="acu-filechanges-total">
        <span class="acu-filechanges-added" :title="text.added">+{{ totalAdded }}</span>
        <span v-if="totalRemoved" class="acu-filechanges-removed" :title="text.removed">−{{ totalRemoved }}</span>
      </span>
    </div>

    <div class="acu-filechanges-list">
      <div v-for="(change, index) in changes" :key="`${change.path}-${index}`" class="acu-filechanges-item">
        <button
          type="button"
          class="acu-filechanges-row"
          :aria-expanded="isOpen(change, index)"
          :title="isOpen(change, index) ? text.collapse : text.expand"
          @click="toggle(change, index)"
        >
          <svg class="acu-filechanges-file-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
          <span class="acu-filechanges-path" :title="change.path">
            <span v-if="splitPath(change.path).dir" class="acu-filechanges-dir">{{ splitPath(change.path).dir }}</span>
            <span class="acu-filechanges-name">{{ splitPath(change.path).base }}</span>
          </span>
          <span v-if="isWholeWrite(change)" class="acu-filechanges-kind">{{ text.writeHint }}</span>
          <span class="acu-filechanges-delta">
            <span v-if="change.added" class="acu-filechanges-added" :title="text.added">+{{ change.added }}</span>
            <span v-if="change.removed" class="acu-filechanges-removed" :title="text.removed">−{{ change.removed }}</span>
          </span>
          <svg class="acu-filechanges-chevron" :class="{ 'is-open': isOpen(change, index) }" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <pre v-if="isOpen(change, index)" class="acu-filechanges-patch"><span
          v-for="(line, lineIndex) in patchLines(change)"
          :key="lineIndex"
          class="acu-filechanges-patch-line"
          :class="lineClass(line)"
        >{{ line || ' ' }}</span></pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FileChange, FileChangeLabels } from '@/types'

const props = withDefaults(
  defineProps<{
    /** 这一轮改动的文件（同路径已在宿主/工具侧合并） */
    changes: FileChange[]
    /** 文案覆盖（宿主要走 i18n 时传自己的翻译） */
    labels?: FileChangeLabels
  }>(),
  { labels: undefined }
)

const text = computed(() => ({
  title: props.labels?.title ?? '文件改动',
  files: props.labels?.files ?? '个文件',
  added: props.labels?.added ?? '新增',
  removed: props.labels?.removed ?? '删除',
  expand: props.labels?.expand ?? '查看改动',
  collapse: props.labels?.collapse ?? '收起改动',
  writeHint: props.labels?.writeHint ?? '整体写入',
  empty: props.labels?.empty ?? '无可预览的差异'
}))

const totalAdded = computed(() =>
  props.changes.reduce((sum, change) => sum + (Number(change.added) || 0), 0)
)
const totalRemoved = computed(() =>
  props.changes.reduce((sum, change) => sum + (Number(change.removed) || 0), 0)
)

/** 展开状态按「路径 + 序号」记：同一文件出现两次（合并前）也不会互相串 */
const openKeys = ref<Set<string>>(new Set())

function keyOf(change: FileChange, index: number): string {
  return `${change.path}#${index}`
}

function isOpen(change: FileChange, index: number): boolean {
  return openKeys.value.has(keyOf(change, index))
}

function toggle(change: FileChange, index: number): void {
  const key = keyOf(change, index)
  const next = new Set(openKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openKeys.value = next
}

function splitPath(path: string): { dir: string; base: string } {
  const normalized = String(path || '').replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  if (index < 0) return { dir: '', base: normalized }
  return { dir: normalized.slice(0, index + 1), base: normalized.slice(index + 1) }
}

/** 整体覆盖写入不是 diff，而是「写了什么」—— 给它一个说明徽标，别让人误读成全新增 */
function isWholeWrite(change: FileChange): boolean {
  return change.kind === 'write' || change.kind === 'create'
}

function patchLines(change: FileChange): string[] {
  const patch = String(change.patch || '')
  if (!patch) return [text.value.empty]
  return patch.split('\n')
}

function lineClass(line: string): string {
  if (line.startsWith('+')) return 'is-add'
  if (line.startsWith('-')) return 'is-del'
  if (line.startsWith('@@')) return 'is-hunk'
  return ''
}
</script>

<style lang="scss" scoped>
.acu-filechanges {
  // 平铺：不套「圆角 + 单层 border」的卡片，靠标题行的层级和行的 hover 底色分区
  margin: var(--acu-space-1-5) 0 var(--acu-space-2);
}

.acu-filechanges-head {
  display: flex;
  align-items: center;
  gap: var(--acu-space-1-5);
  padding: 0 var(--acu-space-1);
  font-size: var(--acu-font-size-2xs);
  color: var(--acu-text-muted);
}

.acu-filechanges-icon {
  display: inline-flex;
  align-items: center;
  color: var(--acu-text-muted);
}

.acu-filechanges-title {
  font-weight: 600;
  color: var(--acu-text-secondary);
}

.acu-filechanges-count {
  color: var(--acu-text-muted);
}

.acu-filechanges-total {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--acu-space-1);
  font-family: var(--acu-font-mono);
}

.acu-filechanges-added {
  color: var(--acu-success);
}

.acu-filechanges-removed {
  color: var(--acu-error);
}

.acu-filechanges-list {
  margin-top: 2px;
}

.acu-filechanges-row {
  display: flex;
  align-items: center;
  gap: var(--acu-space-1-5);
  width: 100%;
  padding: 5px var(--acu-space-1-5);
  border: none;
  border-radius: var(--acu-radius-xs);
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background var(--acu-duration-fast) var(--acu-easing);
  @include acu-focus-ring;

  &:hover {
    background: var(--acu-surface-hover);
  }
}

.acu-filechanges-file-icon {
  flex-shrink: 0;
  color: var(--acu-text-muted);
}

.acu-filechanges-path {
  min-width: 0;
  font-family: var(--acu-font-mono);
  font-size: var(--acu-font-size-xs);
  @include acu-ellipsis(1);
}

.acu-filechanges-dir {
  color: var(--acu-text-muted);
}

.acu-filechanges-name {
  color: var(--acu-text);
}

.acu-filechanges-kind {
  flex-shrink: 0;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--acu-surface-2);
  color: var(--acu-text-muted);
  font-size: var(--acu-font-size-2xs);
  line-height: 16px;
}

.acu-filechanges-delta {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--acu-space-1);
  flex-shrink: 0;
  font-family: var(--acu-font-mono);
  font-size: var(--acu-font-size-2xs);
}

.acu-filechanges-chevron {
  flex-shrink: 0;
  color: var(--acu-text-muted);
  transition: transform var(--acu-duration-fast) var(--acu-easing);

  &.is-open {
    transform: rotate(180deg);
  }
}

.acu-filechanges-patch {
  margin: 2px 0 var(--acu-space-1-5);
  padding: var(--acu-space-1-5) var(--acu-space-2);
  background: var(--acu-surface-2);
  border-radius: var(--acu-radius-xs);
  font-family: var(--acu-font-mono);
  font-size: var(--acu-font-size-2xs);
  line-height: var(--acu-line-height-tight);
  max-height: 260px;
  overflow: auto;
  white-space: pre;
  color: var(--acu-text-secondary);
  @include acu-scrollbar(5px);
}

.acu-filechanges-patch-line {
  display: block;

  &.is-add {
    color: var(--acu-success);
  }

  &.is-del {
    color: var(--acu-error);
  }

  &.is-hunk {
    color: var(--acu-text-muted);
  }
}
</style>
