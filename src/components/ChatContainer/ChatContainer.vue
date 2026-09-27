<template>
  <!--
    对话容器：对外主组件，组合 MessageList / WelcomeScreen / ChatInput。
    - 主题：theme="light" | "dark" | "auto"（auto 跟随系统）
    - 消息为空时展示开场白 + 预设问题
    - 透传 send / retry / select 事件
  -->
  <div
    class="acu-root acu-chat"
    :data-theme="resolvedTheme"
    :style="{ '--acu-max-width': cssMaxWidth }"
  >
    <div class="acu-chat-body">
      <WelcomeScreen
        v-if="!messages.length"
        :title="welcomeTitle"
        :description="welcomeDescription"
        :questions="presetQuestions"
        :max-width="cssMaxWidth"
        @select="onSelectPreset"
      />
      <MessageList
        v-else
        ref="listRef"
        :messages="messages"
        :assistant-name="assistantName"
        :assistant-avatar="assistantAvatar"
        :user-avatar="userAvatar"
        :show-avatar="showAvatar"
        :followup="followup"
        :tool-calls-config="toolCallsConfig"
        :thinking-config="thinkingConfig"
        :actions-config="actionsConfig"
        :message-meta-config="messageMetaConfig"
        :message-rail-config="messageRailConfig"
        @retry="(m) => $emit('retry', m)"
        @followup-select="onFollowupSelect"
      />
    </div>

    <!-- 提问面板：消息列表与输入框之间（传 question 才渲染） -->
    <transition name="acu-collapse">
      <div v-if="question" class="acu-chat-question">
        <AskUserPanel
          :question="question.question"
          :options="question.options"
          :multiple="question.multiple"
          :allow-free-text="question.allowFreeText"
          :submitting="questionSubmitting"
          :labels="questionLabels"
          @answer="(answers) => $emit('answer', answers)"
        />
      </div>
    </transition>

    <div class="acu-chat-footer">
      <ChatInput
        :placeholder="placeholder"
        :disabled="disabled"
        :generating="generating"
        :upload-config="uploadConfig"
        @send="onSend"
        @stop="$emit('stop')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type {
  ChatMessage,
  PresetQuestion,
  ThemeMode,
  UploadConfig,
  SelectedFile,
  FollowupInput,
  ToolCallsConfig,
  ThinkingConfig,
  MessageActionsConfig,
  MessageMetaConfig,
  MessageRailConfig,
  AskUserQuestion,
  AskUserLabels
} from '@/types'
import MessageList from '@/components/MessageList/MessageList.vue'
import WelcomeScreen from '@/components/WelcomeScreen/WelcomeScreen.vue'
import ChatInput from '@/components/ChatInput/ChatInput.vue'
import AskUserPanel from '@/components/AskUserPanel/AskUserPanel.vue'

const props = withDefaults(
  defineProps<{
    /** 消息列表 */
    messages: ChatMessage[]
    /** 预设问题 */
    presetQuestions?: PresetQuestion[]
    /** 开场白标题 */
    welcomeTitle?: string
    /** 开场白描述 */
    welcomeDescription?: string
    /** 模型名称 */
    assistantName?: string
    /** 模型头像 URL */
    assistantAvatar?: string
    /** 用户头像 URL */
    userAvatar?: string
    /** 是否显示头像 */
    showAvatar?: boolean
    /** 主题：light / dark / auto */
    theme?: ThemeMode | 'auto'
    /** 输入框占位 */
    placeholder?: string
    /** 是否禁用输入（生成中） */
    disabled?: boolean
    /**
     * 是否正在生成。
     * 为 true 时输入框右侧按钮由「发送」变为「停止」，点击抛出 `stop` 事件，
     * 由业务侧负责真正中断请求。
     * 与 `disabled` 独立：传 `disabled` 会一并禁用输入框；只传 `generating`
     * 则生成期间仍可继续输入（Enter 不会误发）。
     */
    generating?: boolean
    /**
     * 向用户提问（智能体 `ask_user` 一类的交互）。
     * 传非空对象时，在消息列表与输入框之间渲染提问面板；
     * 用户提交后抛出 `answer` 事件（单选 1 项；多选 N 项；自由输入作为额外一项）。
     */
    question?: AskUserQuestion | null
    /**
     * 提问面板是否正在提交答案（请求飞行中）。
     * 为 true 时面板整体禁用，避免重复提交。
     * @default false
     */
    questionSubmitting?: boolean
    /** 提问面板文案覆盖（宿主项目要走 i18n 时传自己的翻译） */
    questionLabels?: Partial<AskUserLabels>
    /** 附件上传配置 */
    uploadConfig?: Partial<UploadConfig>
    /**
     * 追问建议。
     * - 传数组：静态追问，每条 assistant 完成都展示同样的卡片
     * - 传对象：可启用 provider 动态生成、title、mode 等高级配置
     */
    followup?: FollowupInput
    /**
     * 工具调用展示配置。
     * 默认把同一条消息里的多个工具调用折叠成一组，只展示最新（最后一次）调用，
     * 点击组头可展开全部。传 `{ group: false }` 可恢复为平铺展示。
     */
    toolCallsConfig?: ToolCallsConfig
    /**
     * 思考块展示配置。
     * 默认给思考正文加 320px 高度上限、超出后内部滚动（长思考不会把气泡撑得极高），
     * 并在流式输出时自动贴底跟随。传 `{ scrollable: false }` 可恢复为全部铺开。
     */
    thinkingConfig?: ThinkingConfig
    /**
     * 气泡下方操作栏配置。
     * 默认 user / assistant 气泡下方都有「复制」，最后一条 assistant 额外有「重新生成」。
     * 传 `{ enable: false }` 可整体关闭。
     */
    actionsConfig?: MessageActionsConfig
    /**
     * 元信息行配置（耗时 / 首字延迟 / token 用量 / 时间）。
     * 默认关闭。开启后 assistant 气泡下方会多出一行 `1.2s · ↑1,234 ↓5,678`，
     * 与操作栏同排；`position: 'below'` 可改为单独一行。
     */
    messageMetaConfig?: MessageMetaConfig
    /**
     * 侧边消息条配置。
     * 默认关闭。开启后消息列表左边缘会出现一列短横条，一条消息一根，
     * 用来看清对话结构并点击跳转。
     */
    messageRailConfig?: MessageRailConfig
    /**
     * 内容列的最大宽度。数字按 px 处理，字符串原样使用
     * （`'900px'` / `'60ch'` / `'100%'`）。
     *
     * 一处管三处：开场白内容区、消息列表、输入框——它们在视觉上是同一列，
     * 各自为政会出现「开场白 640 / 消息 768 / 输入框 768」这种对不齐。
     *
     * 默认 `'100%'`：跟着容器走，不再有内置上限。
     * @default '100%'
     */
    maxWidth?: string | number
  }>(),
  {
    presetQuestions: () => [],
    welcomeTitle: '你好，有什么可以帮你？',
    welcomeDescription: '试着问我任何问题，或选择下方的话题开始对话。',
    assistantName: 'AI 助手',
    assistantAvatar: '',
    userAvatar: '',
    showAvatar: true,
    theme: 'light',
    placeholder: '输入消息，Enter 发送，Shift+Enter 换行',
    disabled: false,
    generating: false,
    question: null,
    questionSubmitting: false,
    questionLabels: undefined,
    uploadConfig: () => ({}),
    followup: undefined,
    toolCallsConfig: undefined,
    thinkingConfig: undefined,
    actionsConfig: undefined,
    messageMetaConfig: undefined,
    messageRailConfig: undefined,
    maxWidth: '100%'
  }
)

/** 数字补 px，字符串原样——`:max-width="900"` 与 `max-width="900px"` 等价 */
const cssMaxWidth = computed(() =>
  typeof props.maxWidth === 'number' ? `${props.maxWidth}px` : props.maxWidth
)

const emit = defineEmits<{
  (e: 'send', payload: { text: string; files: SelectedFile[] }): void
  (e: 'retry', message: ChatMessage): void
  (e: 'select', question: PresetQuestion): void
  /** 追问被点击；payload 是被点击的 PresetQuestion */
  (e: 'followup-select', question: PresetQuestion, source: ChatMessage): void
  /** 点击输入框右侧的「停止生成」 */
  (e: 'stop'): void
  /** 用户回答了提问面板：单选 1 项、多选 N 项，自由输入作为额外一项 */
  (e: 'answer', answers: string[]): void
}>()

const listRef = ref<InstanceType<typeof MessageList> | null>(null)

// —— 主题解析 ——
const systemDark = ref(false)
let mq: MediaQueryList | null = null

function updateSystemDark(e: MediaQueryListEvent | MediaQueryList) {
  systemDark.value = e.matches
}

const resolvedTheme = computed<ThemeMode>(() => {
  if (props.theme === 'auto') return systemDark.value ? 'dark' : 'light'
  return props.theme
})

onMounted(() => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    mq = window.matchMedia('(prefers-color-scheme: dark)')
    updateSystemDark(mq)
    mq.addEventListener('change', updateSystemDark)
  }
})

onBeforeUnmount(() => {
  if (mq) mq.removeEventListener('change', updateSystemDark)
})

// —— 事件转发 —— //
function onSend(payload: { text: string; files: SelectedFile[] }) {
  emit('send', payload)
}
function onSelectPreset(q: PresetQuestion) {
  emit('select', q)
}
function onFollowupSelect(q: PresetQuestion, source: ChatMessage) {
  emit('followup-select', q, source)
  // 默认行为：点击追问后自动作为用户消息发送（与 presetQuestion 一致）
  const cfg = props.followup
  const autoSend = Array.isArray(cfg) ? true : cfg?.autoSend !== false
  if (autoSend) {
    emit('send', { text: q.prompt, files: [] })
  }
}

defineExpose({
  scrollToBottom: (smooth?: boolean) => listRef.value?.scrollToBottom(smooth)
})
</script>

<style lang="scss" scoped>
.acu-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--acu-bg);
}

.acu-chat-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.acu-chat-footer {
  flex-shrink: 0;
  padding: var(--acu-space-3) var(--acu-space-4) var(--acu-space-4);
  background: linear-gradient(to top, var(--acu-bg) 70%, transparent);
}

// 提问面板：与消息列、输入框同宽同列
.acu-chat-question {
  flex-shrink: 0;
  width: 100%;
  max-width: var(--acu-max-width);
  margin: 0 auto;
  padding: 0 var(--acu-space-4);
}

// 提问面板出现 / 消失过渡（与 ThinkingBlock 的 acu-collapse 同一套节奏）
.acu-collapse-enter-active,
.acu-collapse-leave-active {
  transition: opacity var(--acu-duration) var(--acu-easing),
    transform var(--acu-duration) var(--acu-easing);
}
.acu-collapse-enter-from,
.acu-collapse-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
