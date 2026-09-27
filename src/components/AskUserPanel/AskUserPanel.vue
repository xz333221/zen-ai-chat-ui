<template>
  <!--
    向用户提问面板（智能体 ask_user 一类的交互）。
    - 单选：点选项即提交（answers = [所选选项]）
    - 多选：勾选若干项后点「提交回答」；自由输入的内容作为额外一项并入
    - 只有选项为空、或 allowFreeText 为 true 时才展示自由输入
    - submitting 为 true 时整体禁用（业务侧提交请求期间传 true）
  -->
  <section
    class="acu-ask-user"
    role="group"
    aria-live="polite"
    :aria-labelledby="titleId"
    :aria-busy="submitting"
  >
    <div :id="titleId" class="acu-ask-user-title">
      <span class="acu-ask-user-icon" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </span>
      <span>{{ labels?.title ?? '等待你的回答' }}</span>
    </div>

    <div class="acu-ask-user-question">{{ question }}</div>

    <div v-if="options.length" class="acu-ask-user-options">
      <!-- 多选：原生 checkbox，键盘天然可达 -->
      <template v-if="multiple">
        <label
          v-for="option in options"
          :key="option"
          class="acu-ask-user-option is-checkbox"
          :class="{ 'is-selected': selected.includes(option) }"
        >
          <input
            v-model="selected"
            type="checkbox"
            :value="option"
            :disabled="disabled"
          />
          <span>{{ option }}</span>
        </label>
      </template>

      <!-- 单选：点选项即提交 -->
      <template v-else>
        <button
          v-for="option in options"
          :key="option"
          type="button"
          class="acu-ask-user-option"
          :disabled="disabled"
          @click="submitSingle(option)"
        >
          <span>{{ option }}</span>
        </button>
      </template>
    </div>

    <form v-if="showFreeText" class="acu-ask-user-form" @submit.prevent="submitForm">
      <input
        v-model="freeText"
        type="text"
        class="acu-ask-user-input"
        :placeholder="placeholder"
        :aria-label="placeholder"
        :disabled="disabled"
      />
      <button type="submit" class="acu-ask-user-submit" :disabled="submitDisabled">
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>{{ labels?.submit ?? '提交回答' }}</span>
      </button>
    </form>

    <!-- 多选且不允许自由输入时，需要一个独立的提交按钮 -->
    <button
      v-else-if="multiple"
      type="button"
      class="acu-ask-user-submit is-standalone"
      :disabled="submitDisabled"
      @click="submitForm"
    >
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span>{{ labels?.submit ?? '提交回答' }}</span>
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AskUserLabels } from '@/types'
import { uid } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    /** 问题正文 */
    question: string
    /** 选项列表；为空表示只能自由输入 */
    options?: string[]
    /**
     * 是否多选。
     * 多选时需要勾选后点「提交回答」；单选点选项即提交。
     * @default false
     */
    multiple?: boolean
    /**
     * 除选项外是否还允许自由输入。
     * 选项为空时恒为 true（否则无内容可答）。
     * @default true
     */
    allowFreeText?: boolean
    /**
     * 业务侧是否正在提交答案（请求飞行中）。
     * 为 true 时面板整体禁用。
     * @default false
     */
    submitting?: boolean
    /** 文案覆盖（宿主项目要走 i18n 时传自己的翻译） */
    labels?: Partial<AskUserLabels>
  }>(),
  {
    options: () => [],
    multiple: false,
    allowFreeText: true,
    submitting: false,
    labels: undefined
  }
)

const emit = defineEmits<{
  /** 用户提交答案：单选为 1 项，多选为 N 项（自由输入作为额外一项） */
  (e: 'answer', answers: string[]): void
}>()

const titleId = uid('acu-ask-user-title')
const selected = ref<string[]>([])
const freeText = ref('')

// 本地闩锁：submitting 回流前拦住第二次点击（连点会重复提交）
const submitted = ref(false)

const disabled = computed(() => props.submitting || submitted.value)
const showFreeText = computed(() => props.allowFreeText || props.options.length === 0)
const placeholder = computed(() => props.labels?.placeholder ?? '输入回答')

const submitDisabled = computed(() => {
  if (disabled.value) return true
  if (props.multiple && selected.value.length === 0 && !freeText.value.trim()) return true
  if (!props.multiple) return !freeText.value.trim()
  return false
})

// 换问题（下一轮提问）时清空上一轮的勾选/输入与闩锁
watch(
  () => props.question,
  () => {
    selected.value = []
    freeText.value = ''
    submitted.value = false
  }
)

// 提交失败时业务侧会把 submitting 放回 false —— 放开闩锁，允许重试
watch(
  () => props.submitting,
  (val, prev) => {
    if (prev && !val) submitted.value = false
  }
)

function submitSingle(option: string) {
  if (disabled.value) return
  submitted.value = true
  emit('answer', [option])
}

function submitForm() {
  if (submitDisabled.value) return
  const answers = props.multiple ? [...selected.value] : []
  const text = freeText.value.trim()
  if (text) answers.push(text)
  if (!answers.length) return
  submitted.value = true
  emit('answer', answers)
}
</script>

<style lang="scss" scoped>
.acu-ask-user {
  @include acu-surface;
  display: flex;
  flex-direction: column;
  gap: var(--acu-space-2);
  padding: var(--acu-space-3) var(--acu-space-3-5);
  margin: var(--acu-space-2) 0;
}

.acu-ask-user-title {
  display: flex;
  align-items: center;
  gap: var(--acu-space-1-5);
  font-size: var(--acu-font-size-sm);
  font-weight: 600;
  color: var(--acu-primary);
}

.acu-ask-user-icon {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.acu-ask-user-question {
  font-size: var(--acu-font-size-base);
  color: var(--acu-text);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.acu-ask-user-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--acu-space-2);
}

.acu-ask-user-option {
  @include acu-btn-base;
  @include acu-focus-ring;
  gap: var(--acu-space-1-5);
  padding: var(--acu-space-2) var(--acu-space-3);
  background: var(--acu-bg);
  border-color: var(--acu-border);
  color: var(--acu-text);
  font-size: var(--acu-font-size-sm);
  text-align: left;

  &:hover:not(:disabled) {
    background: var(--acu-primary-soft);
    border-color: var(--acu-primary);
    color: var(--acu-primary);
  }

  // 多选：整行可点的 label + 原生 checkbox
  &.is-checkbox {
    cursor: pointer;

    input {
      accent-color: var(--acu-primary);
      cursor: inherit;
      margin: 0;
    }

    &.is-selected {
      background: var(--acu-primary-soft);
      border-color: var(--acu-primary);
      color: var(--acu-primary);
    }
  }
}

.acu-ask-user-form {
  display: flex;
  align-items: center;
  gap: var(--acu-space-2);
}

.acu-ask-user-input {
  flex: 1;
  min-width: 0;
  padding: var(--acu-space-2) var(--acu-space-3);
  border: 1px solid var(--acu-border);
  border-radius: var(--acu-radius-sm);
  background: var(--acu-bg);
  color: var(--acu-text);
  font-family: inherit;
  font-size: var(--acu-font-size-sm);
  @include acu-focus-ring(1px);

  &::placeholder {
    color: var(--acu-text-muted);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.acu-ask-user-submit {
  @include acu-btn-base;
  @include acu-focus-ring;
  padding: var(--acu-space-2) var(--acu-space-3-5);
  background: var(--acu-primary);
  border-color: var(--acu-primary);
  color: var(--acu-primary-contrast);
  font-size: var(--acu-font-size-sm);
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: var(--acu-primary-hover);
    border-color: var(--acu-primary-hover);
  }

  &.is-standalone {
    align-self: flex-start;
  }
}

// 出现 / 消失过渡交给宿主（ChatContainer 用 <transition name="acu-collapse"> 包裹）
</style>