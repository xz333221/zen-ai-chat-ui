<template>
  <div class="demo-app">
    <header class="demo-header">
      <div class="demo-brand">
        <span class="demo-logo"></span>
        <span class="demo-title">ai-chat-ui · 组件演示</span>
      </div>
      <div class="demo-actions">
        <button class="demo-btn" @click="clearMessages">清空</button>
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
        :upload-config="{ enabled: true, multiple: true, accept: 'image/*,.pdf,.zip' }"
        @send="onSend"
        @select="onSelect"
        @retry="onRetry"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  ChatContainer,
  useStreaming,
  uid,
  type ChatMessage,
  type ChatAttachment,
  type PresetQuestion,
  type ThemeMode,
  type SelectedFile
} from '../src'

const messages = ref<ChatMessage[]>([])
const streaming = useStreaming()
const busy = ref(false)
const theme = ref<ThemeMode | 'auto'>('light')

const presetQuestions: PresetQuestion[] = [
  { id: 'q1', label: '介绍这个组件库', prompt: '介绍一下 ai-chat-ui 组件库的能力' },
  { id: 'q2', label: '如何接入流式输出', prompt: '怎么接入流式输出？' },
  { id: 'q3', label: '展示 Markdown 渲染', prompt: '展示一下 Markdown 渲染效果' },
  { id: 'q4', label: '深色模式怎么用', prompt: '深色模式如何配置？' }
]

function toggleTheme() {
  const order: (ThemeMode | 'auto')[] = ['light', 'dark', 'auto']
  const idx = order.indexOf(theme.value)
  theme.value = order[(idx + 1) % order.length]
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
  await runMockStream(assistant, text)
}

function onSelect(q: PresetQuestion) {
  onSend({ text: q.prompt, files: [] })
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
</style>
