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
        @retry="(m) => $emit('retry', m)"
        @followup-select="onFollowupSelect"
      />
    </div>

    <div class="acu-chat-footer">
      <ChatInput
        :placeholder="placeholder"
        :disabled="disabled"
        :upload-config="uploadConfig"
        @send="onSend"
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
  FollowupInput
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
    /** 附件上传配置 */
    uploadConfig?: Partial<UploadConfig>
    /**
     * 追问建议。
     * - 传数组：静态追问，每条 assistant 完成都展示同样的卡片
     * - 传对象：可启用 provider 动态生成、title、mode 等高级配置
     */
    followup?: FollowupInput
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
    uploadConfig: () => ({}),
    followup: undefined
  }
)

const emit = defineEmits<{
  (e: 'send', payload: { text: string; files: SelectedFile[] }): void
  (e: 'retry', message: ChatMessage): void
  (e: 'select', question: PresetQuestion): void
  /** 追问被点击；payload 是被点击的 PresetQuestion */
  (e: 'followup-select', question: PresetQuestion, source: ChatMessage): void
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
