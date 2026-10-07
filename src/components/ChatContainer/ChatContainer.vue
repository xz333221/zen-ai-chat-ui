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
        :plan-config="planConfig"
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
          :answers="questionAnswers"
          :labels="questionLabels"
          @answer="(answers) => $emit('answer', answers)"
        />
      </div>
    </transition>

    <!-- 输入框：showInput=false 时不渲染，由宿主自己摆在别处（VSCode 式底部常驻） -->
    <div v-if="showInput" class="acu-chat-footer">
      <ChatInput
        :placeholder="placeholder"
        :disabled="disabled"
        :generating="generating"
        :allow-queue="allowQueue"
        :queued="queued"
        :queue-paused="queuePaused"
        :queue-labels="queueLabels"
        :upload-config="uploadConfig"
        :context-usage="contextUsage"
        @send="onSend"
        @stop="$emit('stop')"
        @unqueue="(id) => $emit('unqueue', id)"
        @flush-queued="$emit('flush-queued')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type {
  ChatMessage,
  PresetQuestion,
  ThemeMode,
  UploadConfig,
  SelectedFile,
  FollowupInput,
  ToolCallsConfig,
  PlanConfig,
  ThinkingConfig,
  MessageActionsConfig,
  MessageMetaConfig,
  MessageRailConfig,
  AskUserQuestion,
  AskUserLabels,
  ContextUsage,
  QueuedMessage,
  QueueLabels
} from '@/types'
import MessageList from '@/components/MessageList/MessageList.vue'
import WelcomeScreen from '@/components/WelcomeScreen/WelcomeScreen.vue'
import ChatInput from '@/components/ChatInput/ChatInput.vue'
import AskUserPanel from '@/components/AskUserPanel/AskUserPanel.vue'
import { useResolvedTheme } from '@/composables/useResolvedTheme'

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
     *
     * 想让生成中也"发得出去"（先进队列，本轮结束后由宿主依次发出），
     * 再传 `allowQueue` + `queued`：见下面两个 prop。
     */
    generating?: boolean
    /**
     * 生成中是否允许发送（先排队）。
     *
     * 为 true 时生成中 Enter / 发送按钮照常抛 `send` —— 宿主在那一刻把它塞进
     * 自己的队列（并把它作为 `queued` 传回来给条带展示）；为 false 时生成中
     * 发送被拦下（原行为）。
     * @default false
     */
    allowQueue?: boolean
    /**
     * 排队中的消息（宿主持有）。非空时输入框里渲染排队条带；
     * 形状见 `QueuedMessage`，渲染规则见 ChatInput 的 `queued`。
     * @default []
     */
    queued?: QueuedMessage[]
    /**
     * 队列是否处于暂停态（流被中止 / 上一条发送失败，等用户手动接续）。
     * 只影响条带提示与队首那颗「立即发送」。
     * @default false
     */
    queuePaused?: boolean
    /** 排队条带文案覆盖（宿主项目要走 i18n 时传自己的翻译） */
    queueLabels?: Partial<QueueLabels>
    /**
     * 是否渲染内置输入框。
     *
     * 默认 `true`。传 `false` 时 ChatContainer 只管上半区（开场白 / 消息列表 /
     * 提问面板），输入框交给宿主自己摆——想做成 VSCode 那种「会话列表页底部
     * 也是同一条输入框」时就得这么拆：列表和对话在中间区二选一，输入框永远
     * 钉在最下方，两边共用同一个 `ChatInput` 实例（切页时草稿、附件都还在）。
     *
     * 配套用导出的 `ChatInput`。注意两件事：
     * 1. 拆出去的那层不在 `.acu-root` 里，`--acu-*` 令牌要自己给：
     *    套一层 `.acu-root` + `:data-theme`（`'auto'` 用 `useResolvedTheme` 解析）
     * 2. 两处要给同一个 `--acu-max-width`，否则输入框和消息列对不齐
     *
     * 关掉输入框后，提问面板成为容器最后一个子元素，会自动补一行下边距。
     * @default true
     */
    showInput?: boolean
    /**
     * 向用户提问（智能体 `ask_user` 一类的交互）。
     * 传非空对象时，在消息列表与输入框之间渲染提问面板；
     * 用户提交后抛出 `answer` 事件（单选 1 项；多选 N 项；自由输入作为额外一项）。
     */
    question?: AskUserQuestion | null
    /**
     * 提问面板的已作答内容（非空即进入只读「已回答」态）。
     *
     * 不传时：面板在点选瞬间自己闪一下「已回答」（打勾 + 高亮），随后由宿主清掉
     * `question` —— 这轮问答在页面上不留痕。
     * 传了时：面板原地转成只读记录（选项保留、所选那项打勾、其余淡化），
     * 想把这轮问答留在页面上就得传它。换下一个问题时记得清空。
     * @default []
     */
    questionAnswers?: string[]
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
     * 上下文占用指示，透传给内置的 ChatInput。
     * 只有 `showInput` 为 true（内置输入框）时才有意义；宿主自己摆输入框时
     * 请直接给那个 ChatInput 传。形状见 types 的 `ContextUsage`。
     */
    contextUsage?: ContextUsage | null
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
     * 计划块展示配置。
     *
     * 计划类工具调用（`update_plan` / `TodoWrite` …）默认渲染成带勾选态的清单，
     * 并在工具组折叠时保持常驻（折叠只会藏起别的工具调用，计划不会消失）。
     * 走 i18n 的宿主在这里传自己的 `title` / `labels`。
     */
    planConfig?: PlanConfig
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
     * **不传**时走 `--acu-max-width` 令牌（默认 `min(100%, 920px)`）：
     * 窄容器下就是跟随容器，宽屏下截到 920px 居中——不传参会一路铺满，
     * 一行文字横跨整块屏幕，看着空。传 `'100%'` 可显式恢复「铺满容器」。
     * @default undefined（用 `--acu-max-width` 令牌）
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
    allowQueue: false,
    queued: () => [],
    queuePaused: false,
    queueLabels: undefined,
    showInput: true,
    question: null,
    questionSubmitting: false,
    questionAnswers: () => [],
    questionLabels: undefined,
    uploadConfig: () => ({}),
    contextUsage: null,
    followup: undefined,
    toolCallsConfig: undefined,
    planConfig: undefined,
    thinkingConfig: undefined,
    actionsConfig: undefined,
    messageMetaConfig: undefined,
    messageRailConfig: undefined,
    maxWidth: undefined
  }
)

/**
 * 数字补 px，字符串原样——`:max-width="900"` 与 `max-width="900px"` 等价。
 *
 * 不传时返回 undefined：Vue 会把这条 inline 样式移除，于是
 * `var(--acu-max-width)` 回落到 `:root` 的令牌值（宿主可以只用 CSS 改上限）。
 */
const cssMaxWidth = computed(() =>
  props.maxWidth === undefined
    ? undefined
    : typeof props.maxWidth === 'number'
      ? `${props.maxWidth}px`
      : props.maxWidth
)

const emit = defineEmits<{
  (e: 'send', payload: { text: string; files: SelectedFile[] }): void
  (e: 'retry', message: ChatMessage): void
  (e: 'select', question: PresetQuestion): void
  /** 追问被点击；payload 是被点击的 PresetQuestion */
  (e: 'followup-select', question: PresetQuestion, source: ChatMessage): void
  /** 点击输入框右侧的「停止生成」 */
  (e: 'stop'): void
  /** 从排队条带里移除一条（id 原样回传；只有开了 `allowQueue` 才会发生） */
  (e: 'unqueue', id: string): void
  /** 暂停态下点了队首的「立即发送」：请宿主立刻把那条发出去 */
  (e: 'flush-queued'): void
  /** 用户回答了提问面板：单选 1 项、多选 N 项，自由输入作为额外一项 */
  (e: 'answer', answers: string[]): void
}>()

const listRef = ref<InstanceType<typeof MessageList> | null>(null)

// —— 主题解析 ——
// 'auto' 要读 prefers-color-scheme，逻辑和宿主自己放输入框时用的是同一份
// （见 useResolvedTheme：输入框被拆到组件外后，那边也得自己解析一次）
const resolvedTheme = useResolvedTheme(() => props.theme)

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

  // showInput=false（输入框在宿主那边）时提问面板就是容器的最后一格，
  // 底下得自己留一口气，否则会贴着容器底边
  &:last-child {
    padding-bottom: var(--acu-space-3);
  }
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
