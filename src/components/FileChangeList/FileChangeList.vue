<template>
  <!--
    文件改动清单：这一段会话到底动了哪些文件。

    为什么单独做一块，而不是塞进工具调用行：
      - 工具调用是「过程」，一条消息里可能有十几个，折叠组只显示最后一个；
        用户想知道的是「结果改了啥」，这个信息不该藏在折叠里。
      - 每个文件一行、带增删行数 —— 一眼扫完，不用逐条展开 JSON。

    默认挂在**每一条 assistant 回复的末尾**（这一轮改了什么，就在这一轮说完的地方交代），
    标题行可折叠；整段会话汇总（`fileChangesPosition="session"`）仍然支持。
    点击某一行从右侧滑出抽屉看 diff。

    清单本身只负责「有哪些文件」，不把 diff 铺在对话流里（十几个文件会拉爆滚动长度）；
    展开时也有 320px 高度上限，八十个文件不会把这一轮推到屏幕外。

    数据来自各条工具调用的参数（`collectFileChanges`），所以流式与历史回放同一口径。
    样式走平铺：没有圆角描边卡片，行 hover 才出底色。
  -->
  <div v-if="changes.length" class="acu-filechanges">
    <!--
      标题行同时是「折叠开关」：收起后仍然保留「几个文件 / +多少 −多少」，
      信息不丢，只是把逐文件的行让出来。整行都是命中区（不是只有那个小箭头）。
    -->
    <button
      type="button"
      class="acu-filechanges-head"
      :aria-expanded="!collapsed"
      :title="collapsed ? text.expand : text.collapse"
      @click="collapsed = !collapsed"
    >
      <span class="acu-filechanges-icon">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </span>
      <span class="acu-filechanges-title">{{ text.title }}</span>
      <span class="acu-filechanges-count">{{ changes.length }} {{ text.files }}</span>
      <span class="acu-filechanges-total">
        <span class="acu-filechanges-added" :title="text.added">+{{ totalAdded }}</span>
        <span v-if="totalRemoved" class="acu-filechanges-removed" :title="text.removed">−{{ totalRemoved }}</span>
      </span>
      <svg
        class="acu-filechanges-toggle"
        :class="{ 'is-collapsed': collapsed }"
        viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <div v-show="!collapsed" class="acu-filechanges-list">
      <div v-for="(change, index) in changes" :key="`${change.path}-${index}`" class="acu-filechanges-item">
        <button
          type="button"
          class="acu-filechanges-row"
          :aria-expanded="openMode === 'inline' ? isOpen(change, index) : undefined"
          :aria-haspopup="openMode === 'drawer' ? 'dialog' : undefined"
          :title="rowTitle(change, index)"
          @click="onRowClick(change, index, $event)"
        >
          <svg class="acu-filechanges-file-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
          <span class="acu-filechanges-path" :title="change.path">
            <span v-if="splitFilePath(change.path).dir" class="acu-filechanges-dir">{{ splitFilePath(change.path).dir }}</span>
            <span class="acu-filechanges-name">{{ splitFilePath(change.path).base }}</span>
          </span>
          <span v-if="isWholeWrite(change)" class="acu-filechanges-kind">{{ text.writeHint }}</span>
          <span class="acu-filechanges-delta">
            <span v-if="change.added" class="acu-filechanges-added" :title="text.added">+{{ change.added }}</span>
            <span v-if="change.removed" class="acu-filechanges-removed" :title="text.removed">−{{ change.removed }}</span>
          </span>
          <svg
            class="acu-filechanges-chevron"
            :class="{ 'is-open': openMode === 'inline' && isOpen(change, index), 'is-link': openMode === 'drawer' }"
            viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <!-- 行内展开：旧行为，`open-mode="inline"` 时才走 -->
        <FileChangeDiff
          v-if="openMode === 'inline' && isOpen(change, index)"
          class="acu-filechanges-patch"
          :patch="change.patch"
          :path="change.path"
          :labels="labels"
        />
      </div>
    </div>

    <!-- 默认的展示方式：右侧抽屉，一份文件一个 -->
    <FileChangeDrawer
      v-if="openMode === 'drawer'"
      v-model:open="drawerOpen"
      :change="activeChange"
      :labels="labels"
      :theme="drawerTheme"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FileChange, FileChangeLabels, FileChangeOpenMode, ThemeMode } from '@/types'
import { splitFilePath } from '@/utils/diff'
import FileChangeDiff from '@/components/FileChangeDiff/FileChangeDiff.vue'
import FileChangeDrawer from '@/components/FileChangeDrawer/FileChangeDrawer.vue'

const props = withDefaults(
  defineProps<{
    /** 这一轮改动的文件（同路径已在宿主/工具侧合并） */
    changes: FileChange[]
    /** 文案覆盖（宿主要走 i18n 时传自己的翻译） */
    labels?: FileChangeLabels
    /**
     * 点开一个文件时 diff 放哪儿。
     * @default 'drawer'
     */
    openMode?: FileChangeOpenMode
    /**
     * 初始是否收起文件清单（标题行常显，点一下展开）。
     *
     * 默认展开：改了两个文件时没必要多一次点击；清单本身有 320px 上限，
     * 八十个文件也不会把对话流撑爆。长清单想一进来就干净，传 `true`。
     * @default false
     */
    defaultCollapsed?: boolean
  }>(),
  { labels: undefined, openMode: 'drawer', defaultCollapsed: false }
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

/**
 * 清单整体的收起状态。
 *
 * 只在组件创建时读一次 `defaultCollapsed`，之后由用户点击接管 ——
 * 跟着 prop 双向同步会让「用户在流式过程中手动收起」被下一次 render 弹回去。
 */
const collapsed = ref(props.defaultCollapsed)

/** 抽屉状态：抽屉本身没有「列表」，只认当前这一份改动 */
const drawerOpen = ref(false)
const activeChange = ref<FileChange | null>(null)
const drawerTheme = ref<ThemeMode>('light')

function keyOf(change: FileChange, index: number): string {
  return `${change.path}#${index}`
}

function isOpen(change: FileChange, index: number): boolean {
  return openKeys.value.has(keyOf(change, index))
}

/** 抽屉挂在 body 上，`.`acu-root[data-theme]` 的作用域够不到 —— 现读现传 */
function readTheme(el: EventTarget | null): ThemeMode {
  const node = el instanceof Element ? el : null
  const carrier = node?.closest('[data-theme]')
  return carrier?.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

function onRowClick(change: FileChange, index: number, event: MouseEvent): void {
  if (props.openMode === 'drawer') {
    drawerTheme.value = readTheme(event.currentTarget)
    activeChange.value = change
    drawerOpen.value = true
    return
  }
  const key = keyOf(change, index)
  const next = new Set(openKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openKeys.value = next
}

function rowTitle(change: FileChange, index: number): string {
  if (props.openMode === 'inline') return isOpen(change, index) ? text.value.collapse : text.value.expand
  return text.value.expand
}

/** 整体覆盖写入不是 diff，而是「写了什么」—— 给它一个说明徽标，别让人误读成全新增 */
function isWholeWrite(change: FileChange): boolean {
  return change.kind === 'write' || change.kind === 'create'
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
  width: 100%;
  // 标题行整体可点（折叠开关）：去掉 button 的默认框与底色，只保留 hover 反馈
  padding: 2px var(--acu-space-1);
  border: none;
  border-radius: var(--acu-radius-xs);
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  font-size: var(--acu-font-size-2xs);
  text-align: left;
  color: var(--acu-text-muted);
  transition: background var(--acu-duration-fast) var(--acu-easing);
  @include acu-focus-ring;

  &:hover {
    background: var(--acu-surface-hover);
  }
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
  // 展开也不放任它无限长：80 个文件 × 26px 会把整轮对话顶出屏幕，
  // 内部滚动 + 标题行折叠两个出口，看全和看得下去都不牺牲
  max-height: 320px;
  overflow-y: auto;
  overflow-x: hidden;
  @include acu-scrollbar(5px);
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

  // 抽屉模式：箭头指向右侧，读作「打开」
  &.is-link {
    transform: rotate(-90deg);
  }
}

// 标题行的折叠箭头：展开时朝上（点了收起），收起时朝下（点了展开）。
// 和每一行末尾那颗「进抽屉」的箭头分开命名，别让两个语义共用一个 class。
.acu-filechanges-toggle {
  flex-shrink: 0;
  color: var(--acu-text-muted);
  transform: rotate(180deg);
  transition: transform var(--acu-duration-fast) var(--acu-easing);

  &.is-collapsed {
    transform: rotate(0deg);
  }
}

// 行内展开（open-mode="inline"）：diff 自己带行号与增删底色，
// 这里只管外框尺寸 —— 仍然不加圆角描边，靠底色与下方内容分区
.acu-filechanges-patch {
  display: block;
  margin: 2px 0 var(--acu-space-1-5);
  max-height: 260px;
  overflow: auto;
  background: var(--acu-code-bg);
  @include acu-scrollbar(5px);
}
</style>
