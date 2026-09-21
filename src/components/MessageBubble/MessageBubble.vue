<template>
  <!--
    单条消息气泡。
    - user：右对齐，主色气泡，头像在右
    - assistant：左对齐，浅色气泡 + 头像 + 名称；含思考块、Markdown 正文、流式光标、附件
  -->
  <div class="acu-bubble-row" :class="`is-${message.role}`">
    <!-- ===== 左侧头像（仅 assistant） ===== -->
    <div v-if="message.role === 'assistant' && showAvatar" class="acu-avatar acu-avatar--left">
      <img v-if="resolvedAssistantAvatar" :src="resolvedAssistantAvatar" alt="" />
      <svg
        v-else
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
        <path d="M19 14l.8 1.9L21.7 17l-1.9.8L19 19.7l-.8-1.9L16.3 17l1.9-.8L19 14z" />
      </svg>
    </div>

    <!-- ===== 中间内容区 ===== -->
    <div class="acu-bubble-main">
      <!-- assistant 名称 -->
      <div v-if="message.role === 'assistant'" class="acu-bubble-name">
        {{ assistantName }}
      </div>

      <!-- 附件（user 显示在正文上方） -->
      <div v-if="hasAttachments" class="acu-attachments" :class="`is-${message.role}`">
        <template v-for="att in message.attachments" :key="att.id">
          <div
            v-if="isImageType(att.type) && att.preview"
            class="acu-att-thumb"
            role="button"
            tabindex="0"
            :aria-label="`预览 ${att.name}`"
            :title="`点击预览 ${att.name}`"
            @click="openPreview(att)"
            @keydown.enter.prevent="openPreview(att)"
            @keydown.space.prevent="openPreview(att)"
          >
            <img :src="att.preview" :alt="att.name" loading="lazy" />
          </div>
          <div v-else class="acu-att-file">
            <span class="acu-att-file-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </span>
            <span class="acu-att-file-info">
              <span class="cu-att-file-name" :title="att.name">{{ att.name }}</span>
              <span class="acu-att-file-size">{{ formatFileSize(att.size) }}</span>
            </span>
          </div>
        </template>
      </div>

      <!-- 气泡内容区 -->
      <div class="acu-bubble" :class="`is-${message.role}`">
        <!-- 思考块（仅 assistant） -->
        <ThinkingBlock
          v-if="message.role === 'assistant' && effectiveReasoning"
          :content="effectiveReasoning"
          :streaming="message.reasoningStatus === 'streaming'"
          :config="thinkingConfig"
        />

        <!-- 工具调用（仅 assistant）：多个调用默认折叠，只展示最新一个 -->
        <div v-if="hasToolCalls" class="acu-bubble-toolcalls">
          <ToolCallGroup :tool-calls="message.toolCalls || []" :config="toolCallsConfig" />
        </div>

        <!-- 正文 -->
        <div v-if="renderedContent" class="acu-bubble-content">
          <MarkdownRenderer :source="renderedContent" />
          <span
            v-if="isStreamingContent"
            class="acu-cursor"
            aria-hidden="true"
          ></span>
        </div>

        <!-- pending：等待响应 -->
        <div v-else-if="message.role === 'assistant' && message.status === 'pending'" class="acu-pending">
          <span class="acu-typing-dots" aria-label="正在思考">
            <span></span><span></span><span></span>
          </span>
        </div>

        <!-- 错误态 -->
        <div v-if="message.status === 'error'" class="acu-bubble-error">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{{ message.error || '生成失败，请重试' }}</span>
          <button type="button" class="acu-retry-btn" @click="$emit('retry', message)">重试</button>
        </div>
      </div>

      <!-- 气泡下方：操作栏 + 元信息（耗时 / token / 时间） -->
      <div
        v-if="showFooterRow"
        class="acu-bubble-footer"
        :class="[`is-${message.role}`, `is-meta-${metaPosition}`]"
      >
        <MessageActions
          v-if="showActions"
          :role="message.role"
          :copy-text="copyText"
          :show-copy="showCopy"
          :show-retry="showRetryAction"
          :copied-duration="actionsConfig?.copiedDuration ?? 1600"
          @retry="$emit('retry', message)"
        />
        <MessageMeta v-if="showMeta" :message="message" :config="messageMetaConfig" />
      </div>
    </div>

    <!-- ===== 右侧头像（仅 user） ===== -->
    <div v-if="message.role === 'user' && showAvatar" class="acu-avatar acu-avatar--right">
      <img v-if="resolvedUserAvatar" :src="resolvedUserAvatar" alt="" />
      <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    </div>

    <!-- 图片预览灯箱（点附件缩略图打开） -->
    <ImagePreview
      v-model:visible="previewVisible"
      v-model:index="previewIndex"
      :images="previewImages"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type {
  ChatMessage,
  ChatAttachment,
  ToolCallsConfig,
  ThinkingConfig,
  MessageActionsConfig,
  MessageMetaConfig
} from '@/types'
import { formatFileSize, isImageType } from '@/utils/format'
import MarkdownRenderer from '@/components/MarkdownRenderer/MarkdownRenderer.vue'
import ThinkingBlock from '@/components/ThinkingBlock/ThinkingBlock.vue'
import ToolCallGroup from '@/components/ToolCallGroup/ToolCallGroup.vue'
import MessageActions from '@/components/MessageActions/MessageActions.vue'
import MessageMeta from '@/components/MessageMeta/MessageMeta.vue'
import ImagePreview from '@/components/ImagePreview/ImagePreview.vue'
import { extractThinkSegments } from '@/composables/useMarkdown'

const props = withDefaults(
  defineProps<{
    message: ChatMessage
    assistantName?: string
    assistantAvatar?: string
    userAvatar?: string
    showAvatar?: boolean
    /** 工具调用展示配置（分组折叠与否） */
    toolCallsConfig?: ToolCallsConfig
    /** 思考块展示配置（高度上限 / 内部滚动 / 流式跟随） */
    thinkingConfig?: ThinkingConfig
    /** 气泡下方操作栏配置（复制 / 重新生成） */
    actionsConfig?: MessageActionsConfig
    /** 元信息行配置（耗时 / token 用量 / 时间） */
    messageMetaConfig?: MessageMetaConfig
    /** 是否是最后一条 assistant 消息（决定「重新生成」是否出现） */
    isLastAssistant?: boolean
  }>(),
  {
    assistantName: 'AI 助手',
    assistantAvatar: '',
    userAvatar: '',
    showAvatar: true,
    toolCallsConfig: undefined,
    thinkingConfig: undefined,
    actionsConfig: undefined,
    messageMetaConfig: undefined,
    isLastAssistant: false
  }
)

defineEmits<{
  (e: 'retry', message: ChatMessage): void
}>()

const resolvedAssistantAvatar = computed(() => props.message.avatar || props.assistantAvatar)
const resolvedUserAvatar = computed(() => props.message.avatar || props.userAvatar)
const hasAttachments = computed(() => !!props.message.attachments?.length)
const hasToolCalls = computed(() => !!props.message.toolCalls?.length)

// 把 content 里嵌入的 <think>...</think> 段抽出来合到 reasoning,
// 避免 <think>…直接混在正文里展示。
const splitContent = computed(() => {
  const src = props.message.content || ''
  if (!src) return { reasoning: '', content: '' }
  // 已经存在独立 reasoning 流（来自 SSE 的 thinking 事件）时不重复抽取,
  // 防止在 thinking 流和 content 流同时携带 <think> 标签时把已抽好的又抽一次。
  if (props.message.reasoningStatus === 'streaming') {
    // 仅剥离标签，不动内容（保留 streaming 体验）
    const stripped = src.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    return { reasoning: '', content: stripped }
  }
  return extractThinkSegments(src)
})
const inlineReasoning = computed(() => splitContent.value.reasoning)
const renderedContent = computed(() => splitContent.value.content)
const effectiveReasoning = computed(() => props.message.reasoning || inlineReasoning.value)
const isStreamingContent = computed(
  () =>
    props.message.role === 'assistant' &&
    props.message.status === 'streaming' &&
    !!renderedContent.value
)

// —— 气泡下方操作栏 —— //

/** 系统消息不显示操作栏 */
const showActions = computed(
  () => props.message.role !== 'system' && props.actionsConfig?.enable !== false
)

// —— 元信息行（耗时 / token / 时间） —— //

/**
 * 默认关闭：这是新增的可见元素，默认打开会让所有既有页面的每条消息都多一行。
 * user 消息还要额外开 showForUser 才显示（user 侧通常只有「时间」有意义）。
 */
const showMeta = computed(() => {
  if (props.messageMetaConfig?.enable !== true) return false
  if (props.message.role === 'system') return false
  if (props.message.role === 'user' && props.messageMetaConfig?.showForUser !== true) return false
  return true
})

const metaPosition = computed(() => props.messageMetaConfig?.position ?? 'inline')
const showFooterRow = computed(() => showActions.value || showMeta.value)

// —— 附件图片预览 —— //

const previewVisible = ref(false)
const previewIndex = ref(0)
/** 本条消息里的图片附件，顺序与缩略图一致，支持左右切换 */
const previewImages = computed(() =>
  (props.message.attachments ?? [])
    .filter((a) => isImageType(a.type) && !!a.preview)
    .map((a) => ({ src: a.preview as string, name: a.name }))
)

function openPreview(att: ChatAttachment) {
  const idx = previewImages.value.findIndex((i) => i.src === att.preview)
  if (idx < 0) return
  previewIndex.value = idx
  previewVisible.value = true
}

/**
 * 复制内容：
 * - assistant 用剥离 <think> 后的正文，避免把思考过程一起复制走
 * - user 直接用原始 content
 */
const copyText = computed(() =>
  props.message.role === 'assistant'
    ? renderedContent.value
    : props.message.content || ''
)

const showCopy = computed(
  () => props.actionsConfig?.copy !== false && !!copyText.value
)

/**
 * 重新生成：仅 assistant，且已产出内容。
 * 流式 / 等待中不显示；错误态已有气泡内的「重试」，这里不再重复。
 * retryOnlyLast 默认 true，只有最后一条 assistant 才出现。
 */
const showRetryAction = computed(() => {
  if (props.message.role !== 'assistant') return false
  if (props.actionsConfig?.retry === false) return false
  if (props.message.status !== 'done') return false
  const onlyLast = props.actionsConfig?.retryOnlyLast ?? true
  if (onlyLast && !props.isLastAssistant) return false
  return true
})
</script>

<style lang="scss" scoped>
.acu-bubble-row {
  display: flex;
  gap: var(--acu-space-3);
  align-items: flex-start;

  // user 消息：整行靠右，头像在右侧（DOM 顺序不变）
  &.is-user {
    justify-content: flex-end;
  }
}

// —— 操作栏的显隐 —— //
// 支持 hover 的设备：默认隐藏，悬停整行 / 键盘聚焦时才淡入（不占额外空间，无需布局抖动处理）
// 触摸设备（无 hover）走 @media 之外的分支：始终可见，否则永远点不到。
// 注意只作用于操作栏——元信息是信息不是操作，任何时候都不该藏。
@media (hover: hover) {
  .acu-bubble-row :deep(.acu-message-actions) {
    opacity: 0;
    transition: opacity var(--acu-duration-fast) var(--acu-easing);
  }

  .acu-bubble-row:hover :deep(.acu-message-actions),
  .acu-bubble-row:focus-within :deep(.acu-message-actions) {
    opacity: 1;
  }
}

// —— 气泡下方一行：操作栏 + 元信息 —— //
// 两者紧挨着成组，不用 space-between 拉开——否则短消息在 680px 宽的列里
// 元信息会被推到很远，看着像跟前一条消息的。user 侧用 row-reverse 翻转顺序，
// 让元信息落在操作栏内侧，整组仍然贴右。
.acu-bubble-footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--acu-space-3);
  max-width: 100%;
  // 与气泡的间隔由 footer 自己负责：MessageActions 原本自带 margin-top，
  // 放进 flex 行后会连 margin 一起参与垂直居中，把操作栏压低 2px，
  // 和旁边的元信息文字对不齐。这里统一接管、把它归零。
  margin-top: var(--acu-space-1);

  &.is-user {
    flex-direction: row-reverse;
  }

  :deep(.acu-message-actions) {
    flex: 0 0 auto;
    margin-top: 0;
  }

  // position: 'below' —— 操作栏在上、元信息在下
  &.is-meta-below {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;

    &.is-user {
      align-items: flex-end;
    }
  }
}

// —— 头像（左右两侧共用基础样式） ——
.acu-avatar {
  flex-shrink: 0;
  width: var(--acu-avatar-size);
  height: var(--acu-avatar-size);
  border-radius: var(--acu-radius-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  // 左侧头像：assistant
  &--left {
    background: var(--acu-surface-2);
    color: var(--acu-text-secondary);
  }

  // 右侧头像：user
  &--right {
    background: var(--acu-primary-soft);
    color: var(--acu-primary);
  }
}

.acu-bubble-main {
  min-width: 0;
  max-width: min(680px, 78%);
  display: flex;
  flex-direction: column;

  // user 消息内容右对齐
  .is-user & {
    align-items: flex-end;
  }
}

.acu-bubble-name {
  font-size: var(--acu-font-size-xs);
  color: var(--acu-text-muted);
  margin-bottom: var(--acu-space-1);
  padding-left: 2px;
}

.acu-bubble {
  position: relative;
  padding: var(--acu-space-3) var(--acu-space-4);
  border-radius: var(--acu-radius-lg);
  font-size: var(--acu-font-size-md);
  line-height: var(--acu-line-height);
  max-width: 100%;
  word-break: break-word;

  &.is-assistant {
    background: var(--acu-bubble-assistant-bg);
    color: var(--acu-bubble-assistant-text);
    border-top-left-radius: var(--acu-radius-xs);
  }

  &.is-user {
    background: var(--acu-bubble-user-bg);
    color: var(--acu-bubble-user-text);
    border-top-right-radius: var(--acu-radius-xs);
  }
}

.acu-bubble-content {
  // 让 Markdown 内容贴合气泡
  :deep(.acu-md) {
    color: inherit;
    font-size: var(--acu-font-size-md);
  }
}

// 工具调用区
.acu-bubble-toolcalls {
  margin-bottom: var(--acu-space-2);
}

// 附件区
.acu-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: var(--acu-space-2);
  margin-bottom: var(--acu-space-2);

  &.is-user {
    justify-content: flex-end;
  }
}

.acu-att-thumb {
  width: 88px;
  height: 88px;
  border-radius: var(--acu-radius);
  overflow: hidden;
  border: 1px solid var(--acu-border);
  background: var(--acu-surface);
  cursor: zoom-in;
  @include acu-focus-ring(1px);
  transition: border-color var(--acu-duration-fast) var(--acu-easing),
    transform var(--acu-duration-fast) var(--acu-easing);

  &:hover {
    border-color: var(--acu-primary);
    transform: translateY(-1px);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.acu-att-file {
  display: inline-flex;
  align-items: center;
  gap: var(--acu-space-2);
  padding: var(--acu-space-2) var(--acu-space-3);
  background: var(--acu-surface);
  border: 1px solid var(--acu-border);
  border-radius: var(--acu-radius-sm);
  max-width: 220px;
}
.acu-att-file-icon {
  color: var(--acu-text-muted);
  flex-shrink: 0;
}
.acu-att-file-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.acu-att-file-name {
  font-size: var(--acu-font-size-sm);
  color: var(--acu-text);
  @include acu-ellipsis(1);
}
.acu-att-file-size {
  font-size: var(--acu-font-size-xs);
  color: var(--acu-text-muted);
}

// pending 态
.acu-pending {
  padding: var(--acu-space-1) 0;
}

// 错误态
.acu-bubble-error {
  display: flex;
  align-items: center;
  gap: var(--acu-space-2);
  margin-top: var(--acu-space-2);
  padding: var(--acu-space-2) var(--acu-space-3);
  background: var(--acu-error-soft);
  color: var(--acu-error);
  border-radius: var(--acu-radius-sm);
  font-size: var(--acu-font-size-sm);
}

.acu-retry-btn {
  margin-left: auto;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  padding: 2px 10px;
  border-radius: var(--acu-radius-xs);
  font-size: var(--acu-font-size-xs);
  font-family: inherit;
  cursor: pointer;
  transition: opacity var(--acu-duration-fast) var(--acu-easing);
  &:hover {
    opacity: 0.75;
  }
}
</style>
