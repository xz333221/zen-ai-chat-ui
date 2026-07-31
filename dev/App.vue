<template>
  <div class="demo-app">
    <header class="demo-header">
      <div class="demo-brand">
        <span class="demo-logo"></span>
        <span class="demo-title">ai-chat-ui · 组件演示</span>
      </div>
      <div class="demo-actions">
        <button class="demo-btn" @click="toggleFollowup">
          追问：{{ followupModeLabel }}
        </button>
        <button class="demo-btn" @click="clearMessages">清空</button>
        <button class="demo-btn" @click="toggleDebug">
          调试：{{ debugMode ? '开' : '关' }}
        </button>
        <button class="demo-btn demo-btn--primary" @click="toggleTheme">
          主题：{{ theme }}
        </button>
      </div>
    </header>

    <main class="demo-main">
      <ChatContainer
        :messages="messages"
        :preset-questions="presetQuestions"
        welcome-title="你好，我是 AI 助手"
        welcome-description="这是一个大模型对话 UI 组件库的演示。试试下面的预设问题，或直接输入消息。"
        assistant-name="AI 助手"
        :theme="theme"
        :disabled="busy"
        :upload-config="{ enabled: true, multiple: true }"
        :followup="followup"
        @send="onSend"
        @select="onSelect"
        @retry="onRetry"
        @followup-select="onFollowupSelect"
      />
    </main>

    <!-- 调试浮动按钮（仅调试模式开启时显示） -->
    <button
      v-if="debugMode"
      type="button"
      class="demo-debug-fab"
      @click="showDebugModal = true"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
      </svg>
      <span>查看数据结构</span>
    </button>

    <!-- 调试模态框 -->
    <div v-if="showDebugModal" class="demo-debug-modal" @click.self="showDebugModal = false">
      <div class="demo-debug-panel">
        <header class="demo-debug-panel-header">
          <div>
            <div class="demo-debug-panel-title">messages 数据结构</div>
            <div class="demo-debug-panel-sub">{{ messages.length }} 条消息 · {{ debugJson.length }} 字符</div>
          </div>
          <div class="demo-debug-panel-actions">
            <button type="button" class="demo-btn" @click="copyDebugJson">复制</button>
            <button type="button" class="demo-btn" @click="showDebugModal = false">关闭</button>
          </div>
        </header>
        <pre class="demo-debug-pre"><code>{{ debugJson }}</code></pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  ChatContainer,
  useStreaming,
  uid,
  type ChatMessage,
  type ChatAttachment,
  type PresetQuestion,
  type ThemeMode,
  type SelectedFile,
  type FollowupConfig
} from '../src'

const messages = ref<ChatMessage[]>([])
const streaming = useStreaming()
const busy = ref(false)
const theme = ref<ThemeMode | 'auto'>('light')

// —— 调试模式：开启后展示「查看数据结构」按钮 ——
const debugMode = ref(false)
const showDebugModal = ref(false)
const debugJson = computed(() => JSON.stringify(messages.value, null, 2))
function toggleDebug() {
  debugMode.value = !debugMode.value
  if (!debugMode.value) showDebugModal.value = false
}
async function copyDebugJson() {
  try {
    await navigator.clipboard.writeText(debugJson.value)
  } catch {
    /* 忽略：file:// 等场景下 clipboard 不可用 */
  }
}

const presetQuestions: PresetQuestion[] = [
  { id: 'q1', label: '介绍这个组件库', prompt: '介绍一下 ai-chat-ui 组件库的能力' },
  { id: 'q2', label: '如何接入流式输出', prompt: '怎么接入流式输出？' },
  { id: 'q3', label: '展示 Markdown 渲染', prompt: '展示一下 Markdown 渲染效果' },
  { id: 'q4', label: '深色模式怎么用', prompt: '深色模式如何配置？' },
  { id: 'q5', label: '查询北京天气', prompt: '北京今天天气怎么样？' }
]

/**
 * 演示：动态生成追问建议（按上一轮 assistant 内容关键字匹配返回不同追问）。
 * 真实场景下可调用大模型 / 后端推荐接口。
 */
const dynamicFollowup: FollowupConfig = {
  title: '继续追问',
  mode: 'latest',
  provider: async (_last: ChatMessage, _history: ChatMessage[]) => {
    // 模拟接口耗时
    await new Promise((r) => setTimeout(r, 600))
    return [
      { id: 'f1', label: '能给个完整示例代码吗？', prompt: '给一个最小可运行的完整示例代码' },
      { id: 'f2', label: '讲讲底层实现', prompt: '它在底层是怎么实现的？' },
      { id: 'f3', label: '和其他库对比', prompt: '和同类组件库相比有什么优势？' }
    ]
  }
}

/** 演示：完全静态的追问列表（provider 不传时使用） */
const staticFollowup: PresetQuestion[] = [
  { id: 's1', label: '再来一个', prompt: '能再讲讲其他特性吗？' },
  { id: 's2', label: '怎么自定义主题？', prompt: '怎么自定义主题颜色？' },
  { id: 's3', label: '支持多语言吗？', prompt: '支持多语言吗？' },
  // 用来测试宽度自适应上限：长文字
  { id: 's4', label: '如果我想让它支持语音输入，或者在移动端键盘弹起时让输入框自适应上移，应该怎么接入这套组件库？', prompt: '...' }
] 

// 切换 followup 模式：动态 ↔ 静态 ↔ 关闭
const followupMode = ref<'dynamic' | 'static' | 'off'>('dynamic')
const followup = computed<FollowupConfig | PresetQuestion[] | undefined>(() => {
  if (followupMode.value === 'off') return undefined
  if (followupMode.value === 'static') return staticFollowup
  return dynamicFollowup
})

function toggleTheme() {
  const order: (ThemeMode | 'auto')[] = ['light', 'dark', 'auto']
  const idx = order.indexOf(theme.value)
  theme.value = order[(idx + 1) % order.length]
}

const followupModeLabel = computed(() => {
  return { dynamic: '动态', static: '静态', off: '关闭' }[followupMode.value]
})
function toggleFollowup() {
  const order: ('dynamic' | 'static' | 'off')[] = ['dynamic', 'static', 'off']
  const idx = order.indexOf(followupMode.value)
  followupMode.value = order[(idx + 1) % order.length]
}

function clearMessages() {
  messages.value = []
  busy.value = false
}

function filesToAttachments(files: SelectedFile[]): ChatAttachment[] {
  return files.map((f) => ({
    id: f.id,
    name: f.file.name,
    size: f.file.size,
    type: f.file.type,
    preview: f.preview
  }))
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function onSend({ text, files }: { text: string; files: SelectedFile[] }) {
  if (busy.value) return
  const userMsg: ChatMessage = {
    id: uid('u'),
    role: 'user',
    content: text,
    status: 'done',
    attachments: filesToAttachments(files),
    createdAt: Date.now()
  }
  messages.value.push(userMsg)

  const assistant = streaming.createAssistant(uid('a'))
  assistant.status = 'pending'
  messages.value.push(assistant)
  if (text === '北京今天天气怎么样？') {
    await runToolCallDemo(assistant)
  } else {
    await runMockStream(assistant, text)
  }
}

function onSelect(q: PresetQuestion) {
  onSend({ text: q.prompt, files: [] })
}

function onFollowupSelect(q: PresetQuestion, _source: ChatMessage) {
  // 这里仅打印：ChatContainer 已经默认会发出 send 事件
  // eslint-disable-next-line no-console
  console.log('[followup clicked]', q)
}

function onRetry(msg: ChatMessage) {
  msg.status = 'streaming'
  msg.content = ''
  msg.reasoning = ''
  msg.reasoningStatus = undefined
  msg.error = undefined
  runMockStream(msg, '重新生成')
}

// —— mock 流式：先输出 reasoning，再输出 content ——
async function runMockStream(msg: ChatMessage, _userText: string) {
  busy.value = true
  try {
    await sleep(500)
    msg.status = 'streaming'

    const reasoning = buildReasoning()
    msg.reasoningStatus = 'streaming'
    for (const ch of reasoning) {
      streaming.append(msg, { type: 'reasoning', delta: ch })
      await sleep(6 + Math.random() * 14)
    }
    msg.reasoningStatus = 'done'
    await sleep(220)

    const content = buildAnswer()
    for (const ch of content) {
      streaming.append(msg, { type: 'content', delta: ch })
      await sleep(4 + Math.random() * 10)
    }
    streaming.finish(msg)
  } catch (e) {
    streaming.fail(msg, (e as Error).message || '模拟失败')
  } finally {
    busy.value = false
  }
}

// —— 演示：工具调用全流程（reasoning → running → done + 结果 → 正文） ——
async function runToolCallDemo(msg: ChatMessage) {
  busy.value = true
  try {
    await sleep(400)
    msg.status = 'streaming'

    // 1) reasoning
    msg.reasoningStatus = 'streaming'
    const reasoning = '用户问的是天气，需要调用 get_weather 工具拉取北京实时数据。'
    for (const ch of reasoning) {
      streaming.append(msg, { type: 'reasoning', delta: ch })
      await sleep(8)
    }
    msg.reasoningStatus = 'done'
    await sleep(200)

    // 2) 推送工具调用（running 状态）。所有后续变更都通过 msg 改，强制走 Vue 的 reactive proxy
    msg.toolCalls = [
      {
        id: uid('tc'),
        name: 'get_weather',
        argsPreview: 'city=北京, unit=celsius',
        arguments: JSON.stringify({ city: '北京', unit: 'celsius' }, null, 2),
        status: 'running'
      }
    ]
    await sleep(1200)

    // 3) 标记完成 + 回填结果（通过 msg proxy 直接改，避免绕开响应式）
    msg.toolCalls[0].status = 'done'
    msg.toolCalls[0].result = JSON.stringify(
      {
        city: '北京',
        temp: 22,
        unit: 'celsius',
        condition: '晴',
        humidity: 41,
        updated_at: '2026-07-31 14:00'
      },
      null,
      2
    )
    await sleep(300)

    // 4) 基于工具结果生成正文
    const content =
      '已为你查询：**北京** 当前 **晴**，气温 **22°C**，湿度 41%。\n\n' +
      '> 工具返回时间：2026-07-31 14:00'
    for (const ch of content) {
      streaming.append(msg, { type: 'content', delta: ch })
      await sleep(8)
    }
    streaming.finish(msg)
  } catch (e) {
    streaming.fail(msg, (e as Error).message || '模拟失败')
  } finally {
    busy.value = false
  }
}

function buildReasoning(): string {
  return [
    '用户发来了一条消息，我需要清晰展示 ai-chat-ui 的核心能力。',
    '先组织结构：功能概览 → 代码示例 → 能力对照表，',
    '代码块用 Vue SFC 演示接入方式，表格列出关键能力，',
    '引用块强调流式 append 的用法，确保 Markdown 各元素都能渲染到位。'
  ].join('')
}

function buildAnswer(): string {
  return `## 功能概览

**ai-chat-ui** 是一个面向大模型对话场景的 Vue 3 组件库，支持以下能力：

1. 流式输出渲染（逐字呈现 + 光标）
2. 「思考过程」独立折叠块
3. 完整 Markdown 渲染与代码高亮
4. 附件上传与预览

### 代码示例

下面是一个最小接入示例：

\`\`\`vue
<template>
  <ChatContainer
    :messages="messages"
    theme="dark"
    @send="onSend"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ChatContainer, useStreaming } from 'ai-chat-ui'
import 'ai-chat-ui/style.css'

const messages = ref([])
const streaming = useStreaming()

async function onSend({ text }) {
  messages.value.push({ id: 'u1', role: 'user', content: text, status: 'done' })
  const assistant = streaming.createAssistant()
  messages.value.push(assistant)
  for await (const chunk of callLLM(text)) {
    streaming.append(assistant, chunk)
  }
}
<\/script>
\`\`\`

> 提示：\`useStreaming().append\` 接收 \`{ type: 'content' | 'reasoning', delta }\` 分片，组件会自动区分思考与正文。

### 能力对照

| 能力 | 说明 |
| --- | --- |
| 流式 | 支持 \`content\` / \`reasoning\` 双通道 |
| 主题 | 浅色 / 深色 / 跟随系统 |
| 附件 | 拖拽 + 点击，图片缩略图 |
| Markdown | 标题、列表、表格、引用、代码高亮 |

行内代码 \`useStreaming\` 与 \`MarkdownRenderer\` 均可独立使用，详见 [示例文档](https://example.com)。

- 支持嵌套列表
  - 二级项
  - 二级项
- 另一项`
}
</script>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Microsoft YaHei', sans-serif;
  background: #f0f0f3;
}
</style>

<style scoped>
.demo-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 920px;
  margin: 0 auto;
  padding: 16px;
  box-sizing: border-box;
}

.demo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px 16px;
}

.demo-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.demo-logo {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: linear-gradient(135deg, #6366f1, #818cf8);
}

.demo-title {
  font-size: 15px;
  font-weight: 600;
  color: #18181b;
}

.demo-actions {
  display: flex;
  gap: 8px;
}

.demo-btn {
  padding: 6px 14px;
  font-size: 13px;
  border: 1px solid #d4d4d8;
  background: #fff;
  color: #52525b;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s ease;
}
.demo-btn:hover {
  border-color: #6366f1;
  color: #6366f1;
}
.demo-btn--primary {
  background: #6366f1;
  border-color: #6366f1;
  color: #fff;
}
.demo-btn--primary:hover {
  background: #5457e5;
  color: #fff;
}

.demo-main {
  flex: 1;
  min-height: 0;
  border: 1px solid #e7e7ea;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(24, 24, 27, 0.08);
  background: #fff;
}

/* —— 调试浮动按钮 —— */
.demo-debug-fab {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 50;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 13px;
  font-family: inherit;
  color: #fff;
  background: #6366f1;
  border: none;
  border-radius: 999px;
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.35);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.demo-debug-fab:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.45);
}

/* —— 调试模态框 —— */
.demo-debug-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(24, 24, 27, 0.55);
  backdrop-filter: blur(2px);
}
.demo-debug-panel {
  width: min(880px, 92vw);
  max-height: 86vh;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.demo-debug-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid #e7e7ea;
}
.demo-debug-panel-title {
  font-size: 15px;
  font-weight: 600;
  color: #18181b;
}
.demo-debug-panel-sub {
  font-size: 12px;
  color: #71717a;
  margin-top: 2px;
}
.demo-debug-panel-actions {
  display: flex;
  gap: 8px;
}
.demo-debug-pre {
  flex: 1;
  margin: 0;
  padding: 16px 18px;
  overflow: auto;
  background: #fafafa;
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #27272a;
  white-space: pre;
}
</style>
