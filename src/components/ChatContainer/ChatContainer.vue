<template>
  <!--
    对话容器：对外主组件，组合 MessageList / WelcomeScreen / ChatInput。
    - 主题：theme="light" | "dark" | "auto"（auto 跟随系统）
    - 消息为空时展示开场白 + 预设问题
    - 透传 send / retry / select 事件
  -->
  <div class="acu-root acu-chat" :data-theme="resolvedTheme">
    <div class="acu-chat-body">
      <WelcomeScreen
        v-if="!messages.length"
        :title="welcomeTitle"
        :description="welcomeDescription"
        :questions="presetQuestions"
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
  MessageRailConfig
} from '@/types'
import MessageList from '@/components/MessageList/MessageList.vue'
import WelcomeScreen from '@/components/WelcomeScreen/WelcomeScreen.vue'
import ChatInput from '@/components/ChatInput/ChatInput.vue'

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
    uploadConfig: () => ({}),
    followup: undefined,
    toolCallsConfig: undefined,
    thinkingConfig: undefined,
    actionsConfig: undefined,
    messageMetaConfig: undefined,
    messageRailConfig: undefined
  }
)

const emit = defineEmits<{
  (e: 'send', payload: { text: string; files: SelectedFile[] }): void
  (e: 'retry', message: ChatMessage): void
  (e: 'select', question: PresetQuestion): void
  /** 追问被点击；payload 是被点击的 PresetQuestion */
  (e: 'followup-select', question: PresetQuestion, source: ChatMessage): void
  /** 点击输入框右侧的「停止生成」 */
  (e: 'stop'): void
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
</style>
