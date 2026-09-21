<template>
  <!--
    消息列表。
    - 流式输出时自动滚动到底部（仅当用户已在底部附近，避免打断阅读）
    - 提供"回到底部"浮动按钮
    - 可选：渲染追问建议（每条 assistant 完成后，调用 followupProvider 或取静态 followupItems）
  -->
  <div class="acu-message-list-wrap">
    <div ref="scrollRef" class="acu-message-list" @scroll="handleScroll">
      <div class="acu-message-list-inner">
        <template v-for="msg in messages" :key="msg.id">
          <MessageBubble
            :message="msg"
            :assistant-name="assistantName"
            :assistant-avatar="assistantAvatar"
            :user-avatar="userAvatar"
            :show-avatar="showAvatar"
            :tool-calls-config="toolCallsConfig"
            :thinking-config="thinkingConfig"
            :actions-config="actionsConfig"
            :message-meta-config="messageMetaConfig"
            :is-last-assistant="msg.id === lastAssistantId"
            @retry="(m) => $emit('retry', m)"
          />
          <!-- 追问建议：assistant 气泡下方独立区域（豆包风格） -->
          <FollowupSuggestions
            v-if="shouldRenderFollowup(msg)"
            :items="followupMap[msg.id]?.items ?? []"
            :title="followupTitle"
            :loading="followupMap[msg.id]?.loading ?? false"
            @select="(q) => $emit('followup-select', q, msg)"
          />
        </template>
      </div>

      <transition name="acu-fade">
        <button
          v-show="!atBottom && messages.length > 0"
          type="button"
          class="acu-scroll-btn"
          aria-label="回到底部"
          @click="scrollToBottom(true)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </transition>
    </div>

    <!-- 侧边消息条：一条消息一根短横条，点击可跳转 -->
    <MessageRail
      v-if="railEnabled"
      :messages="messages"
      :active-id="activeMsgId"
      :config="messageRailConfig"
      :assistant-name="assistantName"
      @select="onRailSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed, nextTick, onMounted } from 'vue'
import type {
  ChatMessage,
  PresetQuestion,
  FollowupConfig,
  ToolCallsConfig,
  ThinkingConfig,
  MessageActionsConfig,
  MessageMetaConfig,
  MessageRailConfig
} from '@/types'
import MessageBubble from '@/components/MessageBubble/MessageBubble.vue'
import FollowupSuggestions from '@/components/FollowupSuggestions/FollowupSuggestions.vue'
import MessageRail from '@/components/MessageRail/MessageRail.vue'

interface PerMessageFollowup {
  items: PresetQuestion[]
  loading: boolean
}

const props = withDefaults(
  defineProps<{
    messages: ChatMessage[]
    assistantName?: string
    assistantAvatar?: string
    userAvatar?: string
    showAvatar?: boolean
    /** 追问配置（数组或对象）。为 undefined/不传时关闭追问 */
    followup?: FollowupConfig | PresetQuestion[]
    /** 工具调用展示配置（默认多个调用折叠成组、只展示最新一个） */
    toolCallsConfig?: ToolCallsConfig
    /** 思考块展示配置（默认正文超高后内部滚动） */
    thinkingConfig?: ThinkingConfig
    /** 气泡下方操作栏配置（复制 / 重新生成） */
    actionsConfig?: MessageActionsConfig
    /** 元信息行配置（耗时 / token 用量 / 时间） */
    messageMetaConfig?: MessageMetaConfig
    /** 侧边消息条配置（一条消息一根短横条） */
    messageRailConfig?: MessageRailConfig
  }>(),
  {
    assistantName: 'AI 助手',
    assistantAvatar: '',
    userAvatar: '',
    showAvatar: true,
    followup: undefined,
    toolCallsConfig: undefined,
    thinkingConfig: undefined,
    actionsConfig: undefined,
    messageMetaConfig: undefined,
    messageRailConfig: undefined
  }
)

const emit = defineEmits<{
  (e: 'retry', message: ChatMessage): void
  (e: 'followup-select', question: PresetQuestion, source: ChatMessage): void
}>()
// emit 通过 setup 自动暴露到模板的 $emit（保留 defineEmits 用于类型推断与文档）
void emit

// —— 追问：把入参归一为 config —— //
const followupConfig = computed<FollowupConfig | undefined>(() => {
  if (!props.followup) return undefined
  if (Array.isArray(props.followup)) {
    return { items: props.followup, mode: 'latest', autoSend: true }
  }
  return props.followup
})

const followupTitle = computed(
  () => followupConfig.value?.title ?? '继续追问'
)

const followupMode = computed<'after-answer' | 'latest'>(
  () => followupConfig.value?.mode ?? 'latest'
)

const showDuringStreaming = computed<boolean>(
  () => followupConfig.value?.showDuringStreaming ?? false
)

// —— 追问映射：messageId -> { items, loading } —— //
const followupMap = reactive<Record<string, PerMessageFollowup>>({})

// 已完成 assistant 的 id 集合（用于 mode='latest' 时定位最近一条）
const lastDoneAssistantId = computed<string | null>(() => {
  for (let i = props.messages.length - 1; i >= 0; i--) {
    const m = props.messages[i]
    if (m.role === 'assistant' && m.status === 'done') return m.id
  }
  return null
})

/** 最后一条 assistant 消息 id（「重新生成」按钮默认只挂在这一条上） */
const lastAssistantId = computed<string | null>(() => {
  for (let i = props.messages.length - 1; i >= 0; i--) {
    if (props.messages[i].role === 'assistant') return props.messages[i].id
  }
  return null
})

// 该消息是否应该展示追问（暴露给模板）
function shouldRenderFollowup(msg: ChatMessage): boolean {
  if (msg.role !== 'assistant') return false
  if (msg.status === 'error') return false
  if (msg.status === 'streaming' || msg.status === 'pending') {
    return showDuringStreaming.value
  }
  if (followupMode.value === 'latest') {
    return msg.id === lastDoneAssistantId.value
  }
  // after-answer：所有已完成的 assistant 都展示
  return msg.status === 'done'
}

/** 调 provider 拿追问；带 token 防过期覆盖 */
let runToken = 0

async function runProviderFor(msg: ChatMessage) {
  const cfg = followupConfig.value
  if (!cfg || typeof cfg.provider !== 'function') return

  // 静态 items 优先（与 provider 二选一）
  if (cfg.items && cfg.items.length) {
    followupMap[msg.id] = { items: cfg.items, loading: false }
    return
  }

  const myToken = ++runToken
  followupMap[msg.id] = { items: [], loading: true }
  try {
    const result = await cfg.provider(msg, props.messages)
    // 若期间被新调用/消息列表更新打断，丢弃结果
    if (myToken !== runToken) return
    const list = Array.isArray(result) ? result : []
    followupMap[msg.id] = { items: list, loading: false }
  } catch (e) {
    if (myToken !== runToken) return
    followupMap[msg.id] = { items: [], loading: false }
    // 静默失败：provider 报错不打扰用户；用户可自行刷新或换源
    // eslint-disable-next-line no-console
    console.warn('[ai-chat-ui] followup provider error:', e)
  }
}

// 监听消息列表变化：给新完成的 assistant 触发追问
watch(
  () =>
    props.messages.map((m) => `${m.id}:${m.status}:${m.content.length}`).join('|'),
  () => {
    recomputeFollowups()
  },
  { immediate: true }
)

/** 清理不再展示的追问（mode='latest' 时切到新的 done，清掉旧的） */
function cleanup() {
  const keep = new Set<string>()
  for (const m of props.messages) {
    if (shouldRenderFollowup(m)) keep.add(m.id)
  }
  for (const id of Object.keys(followupMap)) {
    if (!keep.has(id)) delete followupMap[id]
  }
}

/** 按当前 followupConfig + messages 重新计算 followupMap */
function recomputeFollowups() {
  const cfg = followupConfig.value
  if (!cfg) {
    for (const k of Object.keys(followupMap)) delete followupMap[k]
    return
  }
  if (cfg.items && cfg.items.length) {
    for (const m of props.messages) {
      if (shouldRenderFollowup(m)) {
        followupMap[m.id] = { items: cfg.items, loading: false }
      }
    }
    cleanup()
    return
  }
  if (typeof cfg.provider === 'function') {
    for (const m of props.messages) {
      if (shouldRenderFollowup(m) && !followupMap[m.id]) {
        runProviderFor(m)
      }
    }
    cleanup()
  }
}

// followup 入参整体变化时：清空映射 + 用新 config 立即重算一次
watch(
  () => props.followup,
  () => {
    for (const k of Object.keys(followupMap)) delete followupMap[k]
    runToken++ // 取消进行中的 provider
    // 立即按新配置重算（否则静态 items 切换后不会立刻出现）
    recomputeFollowups()
  }
)

// —— 滚动逻辑 —— //
const scrollRef = ref<HTMLElement | null>(null)
const atBottom = ref(true)
const THRESHOLD = 80

// —— 侧边消息条 —— //
const railEnabled = computed(() => props.messageRailConfig?.enable === true)
/** 视口中心所在的消息 id（侧边条据此高亮） */
const activeMsgId = ref<string | null>(null)

/**
 * 以消息列表视口的**垂直中心**为基准，找最后一条跨越中心线的消息。
 * 用 getBoundingClientRect 而不是 offsetTop：前者天然把滚动偏移算进去，
 * 不用关心 offsetParent 是谁。
 */
function computeActiveId() {
  const el = scrollRef.value
  if (!el) return
  const listRect = el.getBoundingClientRect()
  const midY = listRect.top + listRect.height / 2
  let best: string | null = null
  for (const row of el.querySelectorAll<HTMLElement>('[data-msg-id]')) {
    if (row.getBoundingClientRect().top <= midY) best = row.dataset.msgId ?? null
    else break
  }
  activeMsgId.value = best ?? props.messages[0]?.id ?? null
}

/** 点击侧边条 → 平滑滚动到对应消息 */
function onRailSelect(msg: ChatMessage) {
  const el = scrollRef.value
  if (!el) return
  const id = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(msg.id) : msg.id
  const row = el.querySelector<HTMLElement>(`[data-msg-id="${id}"]`)
  if (!row) return
  // offsetTop 相对 offsetParent（.acu-message-list 自身是定位元素），
  // 正好与 scrollTop 同一基准，不用再叠加 scrollTop
  el.scrollTo({ top: Math.max(0, row.offsetTop - 16), behavior: 'smooth' })
}

function handleScroll() {
  const el = scrollRef.value
  if (!el) return
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  atBottom.value = distance < THRESHOLD
  if (railEnabled.value) computeActiveId()
}

function scrollToBottom(smooth = false) {
  const el = scrollRef.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  atBottom.value = true
}

function contentSignature(): string {
  const last = props.messages[props.messages.length - 1]
  if (!last) return ''
  return `${props.messages.length}:${last.id}:${last.content.length}:${last.reasoning?.length ?? 0}`
}

watch(contentSignature, () => {
  if (atBottom.value) {
    nextTick(() => scrollToBottom(false))
  }
})

watch(
  () => props.messages.length,
  () => {
    // 新增消息（含首条）直接滚到底
    nextTick(() => {
      scrollToBottom(false)
      if (railEnabled.value) computeActiveId()
    })
  }
)

watch(railEnabled, (on) => {
  if (on) nextTick(() => computeActiveId())
})

onMounted(() => {
  scrollToBottom(false)
  nextTick(() => computeActiveId())
})

defineExpose({ scrollToBottom })
</script>

<style lang="scss" scoped>
/* 侧边条要固定在视口内、不随内容滚动，所以必须在滚动容器**外面**，
   这一层负责提供定位上下文；放进 .acu-message-list 里会跟着滚走 */
.acu-message-list-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.acu-message-list {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  @include acu-scrollbar;

  scroll-behavior: auto;
}

.acu-message-list-inner {
  display: flex;
  flex-direction: column;
  gap: var(--acu-turn-gap);
  max-width: var(--acu-max-width);
  width: 100%;
  margin: 0 auto;
  padding: var(--acu-space-5) var(--acu-space-4) var(--acu-space-6);
}

.acu-scroll-btn {
  position: sticky;
  bottom: var(--acu-space-3);
  left: 50%;
  transform: translateX(-50%);
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--acu-border);
  background: var(--acu-bg);
  color: var(--acu-text-secondary);
  border-radius: var(--acu-radius-full);
  cursor: pointer;
  box-shadow: var(--acu-shadow);
  transition: color var(--acu-duration) var(--acu-easing),
    border-color var(--acu-duration) var(--acu-easing),
    background-color var(--acu-duration) var(--acu-easing),
    transform var(--acu-duration) var(--acu-easing);
  z-index: 2;
  margin: 0 auto;

  &:hover {
    color: var(--acu-primary);
    border-color: var(--acu-primary);
  }

  &:active {
    transform: translateX(-50%) translateY(1px);
  }
}

.acu-fade-enter-active,
.acu-fade-leave-active {
  transition: opacity var(--acu-duration) var(--acu-easing),
    transform var(--acu-duration) var(--acu-easing);
}
.acu-fade-enter-from,
.acu-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px);
}
</style>
