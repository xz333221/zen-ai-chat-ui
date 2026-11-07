<template>
  <!--
    unified diff 视图（抽屉与行内展开共用）。

    为什么不用 <pre> 贴 shiki 的 HTML：
      diff 的核心信息是「哪一行、加还是删」，行号列与增删底色必须由 Vue 掌控；
      shiki 只能负责「这一行代码怎么上色」。所以按行取出高亮结果、逐行 v-html。

    样式刻意平铺：不加圆角卡片、不套边框，靠行底色区分增删（与 FileChangeList 一致）。
  -->
  <div class="acu-diff">
    <template v-if="view.length">
      <div v-for="(row, index) in view" :key="index" class="acu-diff-row" :class="`is-${row.type}`">
        <span class="acu-diff-no" aria-hidden="true">{{ row.oldNo ?? '' }}</span>
        <span class="acu-diff-no" aria-hidden="true">{{ row.newNo ?? '' }}</span>
        <span class="acu-diff-sign" aria-hidden="true">{{ row.sign }}</span>
        <span class="acu-diff-code" v-html="row.html"></span>
      </div>
    </template>
    <p v-else class="acu-diff-empty">{{ text.empty }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FileChangeLabels } from '@/types'
import { diffLanguage, escapeHtml, isCodeRow, parseUnifiedDiff } from '@/utils/diff'
import { highlightDiff } from '@/composables/useDiffHighlight'

const props = withDefaults(
  defineProps<{
    /** 统一 diff 文本（FileChange.patch） */
    patch?: string
    /** 文件路径，用来推断语法高亮的语言 */
    path?: string
    /** 文案覆盖 */
    labels?: FileChangeLabels
    /**
     * 超过这么多行就不高亮，直接纯文本。
     * 抽屉是同步打开的，几万行喂给 shiki 会把主线程卡住（而那种量也没人会读完）。
     * @default 1500
     */
    highlightLimit?: number
  }>(),
  { patch: '', path: '', labels: undefined, highlightLimit: 1500 }
)

const text = computed(() => ({
  empty: props.labels?.empty ?? '无可预览的差异'
}))

const rows = computed(() => parseUnifiedDiff(props.patch))
/** 只有代码行参与高亮：hunk 头与说明行不占高亮结果的行号 */
const codeRows = computed(() => rows.value.filter((row) => isCodeRow(row.type)))
const language = computed(() => diffLanguage(props.path))
const codeText = computed(() => codeRows.value.map((row) => row.text).join('\n'))

const highlighted = ref<string[] | null>(null)
// 异步高亮要防「切文件后上一次的结果盖回来」
let runToken = 0

watch(
  [codeText, language],
  async ([code, lang]) => {
    highlighted.value = null
    runToken += 1
    if (!code || !lang || codeRows.value.length > props.highlightLimit) return
    const mine = runToken
    const lines = await highlightDiff(code, lang)
    if (mine === runToken) highlighted.value = lines
  },
  { immediate: true }
)

const view = computed(() => {
  let cursor = 0
  return rows.value.map((row) => {
    let html: string
    if (isCodeRow(row.type)) {
      // 高亮结果与代码行一一对应；没拿到（语言不认 / 还没就绪）就退回转义纯文本
      html = highlighted.value?.[cursor] ?? escapeHtml(row.text)
      cursor += 1
    } else {
      html = escapeHtml(row.text)
    }
    return { ...row, html }
  })
})
</script>

<style lang="scss" scoped>
.acu-diff {
  min-width: 100%;
  width: max-content;
  padding: var(--acu-space-2) 0;
  font-family: var(--acu-font-mono);
  font-size: var(--acu-font-size-xs);
  line-height: 21px;
  color: var(--acu-code-text);
}

.acu-diff-row {
  display: flex;
  align-items: stretch;
  height: 21px;
  white-space: pre;

  &.is-add {
    background: var(--acu-diff-add-bg);
  }

  &.is-del {
    background: var(--acu-diff-del-bg);
  }

  &.is-hunk {
    height: auto;
    padding: var(--acu-space-1) var(--acu-space-3);
    margin: var(--acu-space-1) 0;
    background: var(--acu-surface-2);
    color: var(--acu-text-muted);
    white-space: pre-wrap;
  }

  &.is-note {
    height: auto;
    padding: var(--acu-space-1) var(--acu-space-3);
    color: var(--acu-text-muted);
    white-space: pre-wrap;
  }
}

.acu-diff-no {
  flex: none;
  width: 44px;
  padding-right: var(--acu-space-2);
  text-align: right;
  color: var(--acu-text-muted);
  opacity: 0.7;
  user-select: none;

  & + .acu-diff-no {
    width: 40px;
  }
}

.acu-diff-sign {
  flex: none;
  width: 16px;
  text-align: center;
  color: var(--acu-text-muted);
  user-select: none;

  .is-add & {
    color: var(--acu-success);
  }

  .is-del & {
    color: var(--acu-error);
  }
}

.acu-diff-code {
  padding-right: var(--acu-space-4);
  white-space: pre;

  // shiki 双主题：颜色走 CSS 变量，换主题不用重算高亮
  :deep(span) {
    color: var(--shiki-light, inherit);
  }

  [data-theme='dark'] & :deep(span) {
    color: var(--shiki-dark, inherit);
  }
}

.acu-diff-empty {
  margin: 0;
  padding: var(--acu-space-4) var(--acu-space-3);
  color: var(--acu-text-muted);
  font-family: inherit;
  text-align: center;
}
</style>
