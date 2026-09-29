<template>
  <!--
    会话列表：把"一段段对话"按列表呈现，配合 ChatContainer 就是完整的对话应用骨架。
    - 纯展示组件：数据与状态由消费方持有，交互只抛事件（删除的确认弹窗由消费方做）
    - 内置：搜索过滤、新建按钮、行内重命名（Enter/blur 提交、Esc 取消）、hover 显示操作
    - 条目上的生成中徽标 / 角标 / 次级文案都从 item 字段来，库不做时间格式化与 i18n
  -->
  <div class="acu-conv" :class="{ 'is-compact': compact }">
    <div v-if="showNew || showSearch" class="acu-conv-toolbar">
      <button v-if="showNew" type="button" class="acu-conv-new" @click="emit('new')">
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>{{ label.newConversation }}</span>
      </button>

      <div v-if="showSearch" class="acu-conv-search">
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" /><line x1="20" y1="20" x2="16.2" y2="16.2" />
        </svg>
        <input
          v-model="query"
          type="search"
          class="acu-conv-search-input"
          :placeholder="label.searchPlaceholder"
          :aria-label="label.searchPlaceholder"
        />
      </div>
    </div>

    <ul ref="listRef" class="acu-conv-list">
      <li
        v-for="item in matched"
        :key="item.id"
        class="acu-conv-item"
        :class="{ 'is-active': item.id === activeId, 'is-editing': editingId === item.id }"
        :data-id="item.id"
      >
        <!-- 行内重命名 -->
        <input
          v-if="editingId === item.id"
          :ref="setRenameInput"
          v-model="draftTitle"
          type="text"
          class="acu-conv-rename"
          :aria-label="label.rename"
          @keydown.enter.prevent="commitRename"
          @keydown.esc.prevent="cancelRename"
          @blur="commitRename"
        />

        <template v-else>
          <button
            type="button"
            class="acu-conv-main"
            :aria-current="item.id === activeId ? 'true' : undefined"
            @click="emit('select', item.id, item)"
            @dblclick="startRename(item.id, item.title)"
          >
            <span class="acu-conv-title">{{ item.title || label.untitled }}</span>
            <span v-if="item.generatingText" class="acu-conv-meta is-generating">
              <span class="acu-conv-dot" aria-hidden="true"></span>
              <span>{{ item.generatingText }}</span>
            </span>
            <span v-else-if="item.meta || item.badge" class="acu-conv-meta">
              <span v-if="item.badge" class="acu-conv-badge">{{ item.badge }}</span>
              <span v-if="item.meta" class="acu-conv-meta-text">{{ item.meta }}</span>
            </span>
          </button>

          <span class="acu-conv-actions">
            <button
              type="button"
              class="acu-conv-action"
              :title="label.rename"
              :aria-label="label.rename"
              @click="startRename(item.id, item.title)"
            >
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </button>
            <button
              type="button"
              class="acu-conv-action"
              :title="label.delete"
              :aria-label="label.delete"
              @click="emit('delete', item.id, item)"
            >
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </button>
          </span>
        </template>
      </li>
    </ul>

    <p v-if="emptyText" class="acu-conv-empty">
      <span>{{ emptyText }}</span>
      <span v-if="showEmptyHint" class="acu-conv-empty-hint">{{ label.emptyHint }}</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ConversationItem, ConversationListLabels } from '@/types'

const props = withDefaults(
  defineProps<{
    /** 会话列表 */
    items: ConversationItem[]
    /** 当前选中的会话 id */
    activeId?: string | null
    /** 加载中（列表为空时展示 loading 文案） */
    loading?: boolean
    /** 是否展示搜索框（组件内按 title / searchText 过滤） */
    showSearch?: boolean
    /** 是否展示新建按钮 */
    showNew?: boolean
    /** 紧凑模式：更小的行高与字号，适合窄面板 */
    compact?: boolean
    /** 文案覆盖（宿主项目要走 i18n 时传自己的翻译） */
    labels?: Partial<ConversationListLabels>
  }>(),
  {
    activeId: null,
    loading: false,
    showSearch: true,
    showNew: true,
    compact: false,
    labels: undefined
  }
)

const emit = defineEmits<{
  /** 选中某条会话 */
  (e: 'select', id: string, item: ConversationItem): void
  /** 点击新建 */
  (e: 'new'): void
  /** 提交重命名（仅在新标题非空且与原值不同时触发） */
  (e: 'rename', id: string, title: string): void
  /** 请求删除（确认弹窗由消费方负责） */
  (e: 'delete', id: string, item: ConversationItem): void
}>()

const DEFAULT_LABELS: ConversationListLabels = {
  newConversation: '新建会话',
  searchPlaceholder: '搜索会话...',
  empty: '暂无会话',
  emptyHint: '点击上方按钮开始对话',
  noResult: '未找到匹配的会话',
  loading: '加载会话中...',
  rename: '重命名',
  delete: '删除',
  untitled: '无标题'
}

const label = computed<ConversationListLabels>(() => ({ ...DEFAULT_LABELS, ...props.labels }))

// —— 搜索过滤（在组件内做，消费方传全量列表即可） ——
const query = ref('')
const matched = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.items
  return props.items.filter((item) =>
    `${item.title || ''} ${item.searchText || ''}`.toLowerCase().includes(q)
  )
})

// —— 行内重命名 ——
const editingId = ref<string | null>(null)
const draftTitle = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

/** 函数式 ref：编辑输入框在 v-for 内，字符串 ref 会收成数组 */
function setRenameInput(el: unknown) {
  renameInput.value = (el as HTMLInputElement) || null
}

function startRename(id: string, title: string) {
  editingId.value = id
  draftTitle.value = title || ''
  void nextTick(() => {
    renameInput.value?.focus()
    renameInput.value?.select()
  })
}

/** Enter / blur 提交；标题没变或为空则只退出编辑态，不抛事件 */
function commitRename() {
  const id = editingId.value
  if (!id) return
  const title = draftTitle.value.trim()
  editingId.value = null
  const original = props.items.find((item) => item.id === id)?.title || ''
  if (title && title !== original) emit('rename', id, title)
}

function cancelRename() {
  editingId.value = null
}

// —— 当前项变化时滚进视野（同 MessageRail 的做法） ——
const listRef = ref<HTMLElement | null>(null)
watch(
  () => props.activeId,
  async (id) => {
    if (!id) return
    await nextTick()
    listRef.value
      ?.querySelector(`[data-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }
)

const emptyText = computed(() => {
  if (matched.value.length) return ''
  if (!props.items.length) return props.loading ? label.value.loading : label.value.empty
  return label.value.noResult
})

/** 只有"真的没有会话"时才提示去点新建按钮 */
const showEmptyHint = computed(() => !props.items.length && !props.loading)
</script>

<style lang="scss" scoped>
.acu-conv {
  display: flex;
  flex-direction: column;
  gap: var(--acu-space-2);
  min-height: 0;
  height: 100%;
  font-size: var(--acu-font-size-sm);
  color: var(--acu-text);
}

.acu-conv-toolbar {
  display: flex;
  flex-direction: column;
  gap: var(--acu-space-1-5);
  flex-shrink: 0;
}

.acu-conv-new {
  @include acu-btn-base;
  @include acu-focus-ring;
  justify-content: flex-start;
  width: 100%;
  padding: var(--acu-space-2) var(--acu-space-2-5);
  background: var(--acu-primary-soft);
  color: var(--acu-primary);
  font-size: var(--acu-font-size-sm);
  font-weight: 600;

  &:hover:not(:disabled) {
    background: var(--acu-primary-soft-hover);
  }
}

.acu-conv-search {
  display: flex;
  align-items: center;
  gap: var(--acu-space-1-5);
  padding: 0 var(--acu-space-2);
  border: 1px solid var(--acu-border);
  border-radius: var(--acu-radius-sm);
  background: var(--acu-surface);
  color: var(--acu-text-muted);
  @include acu-focus-ring(1px);

  &:focus-within {
    border-color: var(--acu-primary);
  }
}

.acu-conv-search-input {
  flex: 1;
  min-width: 0;
  padding: var(--acu-space-1-5) 0;
  border: none;
  background: transparent;
  color: var(--acu-text);
  font-family: inherit;
  font-size: var(--acu-font-size-sm);
  outline: none;

  &::placeholder {
    color: var(--acu-text-muted);
  }

  // 去掉 type=search 的原生清除按钮，避免和右侧操作按钮的视觉打架
  &::-webkit-search-cancel-button {
    display: none;
  }
}

.acu-conv-list {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  @include acu-scrollbar;
}

.acu-conv-item {
  position: relative;
  display: flex;
  align-items: center;
  border-radius: var(--acu-radius-sm);

  // 选中态：主色软底 + 左侧 3px 竖条
  &.is-active {
    background: var(--acu-primary-soft);

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: var(--acu-space-1);
      bottom: var(--acu-space-1);
      width: 3px;
      border-radius: var(--acu-radius-full);
      background: var(--acu-primary);
    }

    .acu-conv-title {
      color: var(--acu-primary);
      font-weight: 600;
    }
  }
}

.acu-conv-main {
  @include acu-btn-base;
  @include acu-focus-ring;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--acu-space-0-5);
  padding: var(--acu-space-2) var(--acu-space-2-5);
  background: transparent;
  border-color: transparent;
  color: inherit;
  text-align: left;
  font-size: var(--acu-font-size-sm);
}

// hover 底色要避开选中行：这个按钮的底是画在 li 的选中底（primary-soft）
// **之上**的，无条件给 hover 上 --acu-surface-hover 会让「选中 + 悬停」的
// 那一行整块翻成中性灰 —— 指针一划过，当前会话的紫色标识就没了，
// 看起来像选中态被取消。选中行继续吃 li 的底色，不叠这一层。
.acu-conv-item:not(.is-active) .acu-conv-main:hover:not(:disabled) {
  background: var(--acu-surface-hover);
}

.acu-conv-title {
  width: 100%;
  @include acu-ellipsis(1);
}

.acu-conv-meta {
  display: flex;
  align-items: center;
  gap: var(--acu-space-1);
  width: 100%;
  min-width: 0;
  font-size: var(--acu-font-size-2xs);
  color: var(--acu-text-muted);

  &.is-generating {
    color: var(--acu-primary);
  }
}

.acu-conv-meta-text {
  @include acu-ellipsis(1);
  min-width: 0;
}

.acu-conv-badge {
  flex-shrink: 0;
  padding: 0 var(--acu-space-1);
  border: 1px solid var(--acu-border-strong);
  border-radius: var(--acu-radius-xs);
  font-size: var(--acu-font-size-2xs);
  line-height: 1.5;
}

.acu-conv-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: var(--acu-radius-full);
  background: currentColor;
  // 循环脉冲用 ease-in-out，不用全局的 --acu-easing（那是给一次性过渡的
  // 「快进慢出」曲线，套在往返关键帧上会抽搐）
  animation: acu-conv-pulse 1.2s ease-in-out infinite;
}

@keyframes acu-conv-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}

.acu-conv-actions {
  display: flex;
  align-items: center;
  gap: var(--acu-space-0-5);
  padding-right: var(--acu-space-1-5);
  opacity: 0;
  transition: opacity var(--acu-duration-fast) var(--acu-easing);
}

.acu-conv-item:hover .acu-conv-actions,
.acu-conv-item:focus-within .acu-conv-actions {
  opacity: 1;
}

.acu-conv-action {
  @include acu-btn-base;
  @include acu-focus-ring(1px);
  padding: var(--acu-space-1);
  background: transparent;
  color: var(--acu-text-muted);

  &:hover:not(:disabled) {
    background: var(--acu-surface-2);
    color: var(--acu-text);
  }
}

.acu-conv-rename {
  flex: 1;
  min-width: 0;
  margin: var(--acu-space-1) var(--acu-space-2-5);
  padding: var(--acu-space-1) var(--acu-space-1-5);
  border: 1px solid var(--acu-primary);
  border-radius: var(--acu-radius-xs);
  background: var(--acu-bg);
  color: var(--acu-text);
  font-family: inherit;
  font-size: var(--acu-font-size-sm);
  outline: none;
}

.acu-conv-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--acu-space-1);
  margin: var(--acu-space-4) 0;
  color: var(--acu-text-muted);
  font-size: var(--acu-font-size-xs);
  text-align: center;
}

.acu-conv-empty-hint {
  font-size: var(--acu-font-size-2xs);
}

// 紧凑模式：更小的行高与字号，窄面板 / 侧栏里更省空间
.acu-conv.is-compact {
  gap: var(--acu-space-1-5);
  font-size: var(--acu-font-size-xs);

  .acu-conv-main {
    gap: 0;
    padding: var(--acu-space-1-5) var(--acu-space-2);
    font-size: var(--acu-font-size-xs);
  }

  .acu-conv-meta {
    font-size: var(--acu-font-size-2xs);
  }

  .acu-conv-new {
    padding: var(--acu-space-1-5) var(--acu-space-2);
    font-size: var(--acu-font-size-xs);
  }
}
</style>