<template>
  <!--
    向用户提问面板（智能体 ask_user 一类的交互）。
    - 单选：点选项即提交（answers = [所选选项]）
    - 多选：勾选若干项后点「提交回答」；自由输入的内容作为额外一项并入
    - 只有选项为空、或 allowFreeText 为 true 时才展示自由输入
    - submitting 为 true 时整体禁用（业务侧提交请求期间传 true）

    选完必须看得出来选了什么：
    - 点下去的那一刻，所选选项立刻打勾 + 主色高亮，其余选项淡化，标题转「已回答」
      （不等宿主回传 submitting / 清空 question，否则用户只看到"整块变灰"）
    - 宿主想把这轮问答留在页面上当记录，就把答案回传给 answers：
      面板进入只读「已回答」态，选项原样保留、所选那项打勾，输入框换成答案 chip
  -->
  <section
    class="acu-ask-user"
    :class="{ 'is-answered': isAnswered }"
    role="group"
    aria-live="polite"
    :aria-labelledby="titleId"
    :aria-busy="submitting"
  >
    <div :id="titleId" class="acu-ask-user-title">
      <span class="acu-ask-user-icon" aria-hidden="true">
        <!-- 已作答：状态从「等你回答」变成「你的回答」，图标也跟着从问句换成对勾 -->
        <svg
          v-if="isAnswered"
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <svg
          v-else
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
      <span>{{ isAnswered ? answeredTitle : title }}</span>
      <!-- 只读留档态下把答案也念一遍：光看勾选态，读屏用户不知道提交了什么 -->
      <span v-if="readonly" class="acu-ask-user-title-answer">{{ chosen.join(' / ') }}</span>
    </div>

    <div class="acu-ask-user-question">{{ question }}</div>

    <div v-if="options.length" class="acu-ask-user-options">
      <!-- 多选：原生 checkbox，键盘天然可达 -->
      <template v-if="multiple">
        <label
          v-for="option in options"
          :key="option"
          class="acu-ask-user-option is-checkbox"
          :class="{ 'is-selected': chosen.includes(option), 'is-dimmed': isDimmed(option) }"
        >
          <input
            type="checkbox"
            :checked="chosen.includes(option)"
            :disabled="disabled"
            @change="toggleOption(option)"
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
          :class="{ 'is-selected': marked.includes(option), 'is-dimmed': isDimmed(option) }"
          :disabled="disabled"
          @click="submitSingle(option)"
        >
          <!-- 纯装饰：选中标记。不改既有元素的语义与 class，见 ui-polish 的例外条款 -->
          <svg
            v-if="marked.includes(option)"
            class="acu-ask-user-check"
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            stroke-width="2.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{{ option }}</span>
        </button>
      </template>
    </div>

    <!-- 已作答且原样只读时，自由输入的答案没有输入框可落脚，改成 chip 列出来 -->
    <div v-if="extraAnswers.length" class="acu-ask-user-extras">
      <span
        v-for="answer in extraAnswers"
        :key="answer"
        class="acu-ask-user-extra"
      >{{ answer }}</span>
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

    <!-- 多选且不允许自由输入时，需要一个独立的提交按钮（只读留档态下不给） -->
    <button
      v-else-if="multiple && !readonly"
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
    /**
     * 已作答内容（非空即进入只读「已回答」态）。
     *
     * 组件自己也会在点选瞬间切到「已回答」——但那是**临时**的，宿主随后把
     * `question` 清掉，这轮问答在页面上就什么都不剩了。想让问答留档
     * （放进消息列表、或让面板原地留着），把答案回传到这里即可：
     * 选项保留、所选那项打勾、其余淡化，输入框换成答案 chip，整块不可交互。
     * @default []
     */
    answers?: string[]
    /** 文案覆盖（宿主项目要走 i18n 时传自己的翻译） */
    labels?: Partial<AskUserLabels>
  }>(),
  {
    options: () => [],
    multiple: false,
    allowFreeText: true,
    submitting: false,
    answers: () => [],
    labels: undefined
  }
)

const emit = defineEmits<{
  /** 用户提交答案：单选为 1 项，多选为 N 项（自由输入作为额外一项） */
  (e: 'answer', answers: string[]): void
}>()

const titleId = uid('acu-ask-user-title')
const freeText = ref('')

// 已勾选 / 已点中的那几项。多选提交后不清空 —— 勾选态就是"我选了什么"
const picked = ref<string[]>([])

// 本地闩锁：submitting 回流前拦住第二次点击（连点会重复提交）
const submitted = ref(false)

/** 宿主回传了答案 → 只读留档态（不再回抛 answer，也不可再改） */
const readonly = computed(() => props.answers.length > 0)
/** 已作答 = 只读留档 或 本地刚提交（宿主清 question 之前的那一小段） */
const isAnswered = computed(() => readonly.value || submitted.value)
/** 当前答案：只读态以宿主的为准，否则用本地这份 */
const chosen = computed(() => (readonly.value ? props.answers : picked.value))
/** 选项上的"已选"标记。单选只在作答后才打勾，免得点之前就亮着 */
const marked = computed(() => (props.multiple || isAnswered.value ? chosen.value : []))

const disabled = computed(() => props.submitting || submitted.value || readonly.value)
const showFreeText = computed(
  () => !readonly.value && (props.allowFreeText || props.options.length === 0)
)
const placeholder = computed(() => props.labels?.placeholder ?? '输入回答')
const title = computed(() => props.labels?.title ?? '等待你的回答')
const answeredTitle = computed(() => props.labels?.answered ?? '已回答')

/** 只读态下，不在选项里的那些答案（自由输入的内容） */
const extraAnswers = computed(() =>
  readonly.value ? chosen.value.filter((a) => !props.options.includes(a)) : []
)

const submitDisabled = computed(() => {
  if (disabled.value) return true
  if (props.multiple) return picked.value.length === 0 && !freeText.value.trim()
  return !freeText.value.trim()
})

function isDimmed(option: string): boolean {
  return isAnswered.value && !chosen.value.includes(option)
}

// 换问题（下一轮提问）时清空上一轮的勾选/输入与闩锁
watch(
  () => props.question,
  () => {
    picked.value = []
    freeText.value = ''
    submitted.value = false
  }
)

// 提交失败时业务侧会把 submitting 放回 false —— 放开闩锁，允许重试
watch(
  () => props.submitting,
  (val, prev) => {
    if (!prev || val) return
    submitted.value = false
    // 单选失败：把"已选"标记一并撤回，否则会一直亮着，像是已经答过了
    if (!props.multiple) picked.value = []
  }
)

function toggleOption(option: string) {
  if (disabled.value) return
  const index = picked.value.indexOf(option)
  if (index >= 0) picked.value.splice(index, 1)
  else picked.value.push(option)
}

function submitSingle(option: string) {
  if (disabled.value) return
  picked.value = [option]
  submitted.value = true
  emit('answer', [option])
}

function submitForm() {
  if (submitDisabled.value) return
  const answers = props.multiple ? [...picked.value] : []
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

  // 只读留档态：选项是"记录"不是"坏掉的控件"，别摆出 not-allowed / pointer 的手型
  &.is-answered .acu-ask-user-option {
    cursor: default;
  }
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

// 只读留档态：把选了什么再念一遍（勾选态只对看得见的人有意义）
.acu-ask-user-title-answer {
  font-weight: 500;
  color: var(--acu-text-secondary);
  overflow-wrap: anywhere;

  &::before {
    content: '·';
    margin-right: var(--acu-space-1-5);
    color: var(--acu-text-muted);
  }
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

  // 选中的那项：主色底 + 主色字 + 对勾。禁用不等于"变灰"——
  // 面板一提交就整体 disabled，选中的项必须比周围更清楚，否则等于没反馈
  &.is-selected {
    background: var(--acu-primary-soft);
    border-color: var(--acu-primary);
    color: var(--acu-primary);
    opacity: 1;

    &:disabled {
      opacity: 1;
    }
  }

  // 没选的那几项退到背景里，让"选了哪个"一眼可辨。
  // 用 0.5 跟 acu-btn-base 的 :disabled 同档：再淡就掉到 AA 以下，
  // 而"已作答"是有可能被截屏/复制的正常内容，不该做成灰雾
  &.is-dimmed {
    opacity: 0.5;

    &:disabled {
      opacity: 0.5;
    }
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

    // 只读留档态：勾选框禁用后会掉到浏览器默认的灰，压掉它，勾选态要留住
    input:disabled {
      cursor: default;
      opacity: 1;
    }
  }
}

// 对勾的入场：只做透明度 + 一点点缩放，别在选项里弹跳
.acu-ask-user-check {
  flex-shrink: 0;
  animation: acu-ask-user-check-in var(--acu-duration) var(--acu-easing) both;
}

@keyframes acu-ask-user-check-in {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.acu-ask-user-extras {
  display: flex;
  flex-wrap: wrap;
  gap: var(--acu-space-2);
}

.acu-ask-user-extra {
  padding: var(--acu-space-1-5) var(--acu-space-3);
  border-radius: var(--acu-radius-full);
  background: var(--acu-primary-soft);
  border: 1px solid var(--acu-primary);
  color: var(--acu-primary);
  font-size: var(--acu-font-size-sm);
  overflow-wrap: anywhere;
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
