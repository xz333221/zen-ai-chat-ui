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
        <button class="demo-btn" @click="toggleToolGroup">
          工具折叠：{{ toolGroupEnabled ? '开' : '关' }}
        </button>
        <button class="demo-btn" @click="toggleMeta">
          元信息：{{ metaModeLabel }}
        </button>
        <button class="demo-btn" @click="toggleRail">
          侧边条：{{ railModeLabel }}
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
        :generating="busy"
        :placeholder="busy ? '正在生成中…右侧按钮可停止' : '输入消息，Enter 发送，Shift+Enter 换行'"
        :upload-config="{ enabled: true, multiple: true }"
        @stop="onStop"
        :followup="followup"
        :tool-calls-config="toolCallsConfig"
        :message-meta-config="messageMetaConfig"
        :message-rail-config="messageRailConfig"
        :max-width="demoMaxWidth"
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
  resetStreamTiming,
  uid,
  type ChatMessage,
  type ChatAttachment,
  type PresetQuestion,
  type ThemeMode,
  type SelectedFile,
  type FollowupConfig,
  type ToolCallsConfig,
  type MessageMetaConfig,
  type MessageRailConfig,
  type TokenUsage
} from '../src'

const messages = ref<ChatMessage[]>([])
const streaming = useStreaming()
const busy = ref(false)
const theme = ref<ThemeMode | 'auto'>('light')

// 内容列最大宽度。演示页的 .demo-app 只有 920px，看不出「去掉上限」的差别，
// 所以支持 ?maxWidth=900 直接试；不传则用组件默认的 100%。
// 纯数字转成 number 走 prop 的「数字补 px」分支，其余（'60ch' 等）原样透传。
const rawMaxWidth = new URLSearchParams(location.search).get('maxWidth')
const demoMaxWidth: string | number =
  rawMaxWidth == null || rawMaxWidth === ''
    ? '100%'
    : /^\d+(\.\d+)?$/.test(rawMaxWidth)
      ? Number(rawMaxWidth)
      : rawMaxWidth

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
  { id: 'q5', label: '查询北京天气', prompt: '北京今天天气怎么样？' },
  { id: 'q6', label: '多工具调用折叠', prompt: '帮我排查一下项目报错' },
  { id: 'q7', label: '超长思考滚动', prompt: '帮我分析一下这段超长思考过程' },
  { id: 'q8', label: '多轮对话（侧边条）', prompt: '一次性铺出多轮对话，用来演示左侧那列消息条' }
]

// —— 工具调用展示配置：演示「多个调用折叠成组，只展示最新一个」 ——
const toolGroupEnabled = ref(true)
const toolCallsConfig = computed<ToolCallsConfig>(() => ({
  group: toolGroupEnabled.value
}))
function toggleToolGroup() {
  toolGroupEnabled.value = !toolGroupEnabled.value
}

// —— 消息元信息：耗时 / 首字延迟 / token —— //
// 三档循环，顺便把「同排 / 单独一行」两种排布都演示到
const metaMode = ref<'off' | 'inline' | 'below'>('inline')
const messageMetaConfig = computed<MessageMetaConfig>(() => ({
  enable: metaMode.value !== 'off',
  items: ['duration', 'firstToken', 'tokens'],
  position: metaMode.value === 'below' ? 'below' : 'inline'
}))
const metaModeLabel = computed(
  () => ({ off: '关', inline: '同排', below: '换行' })[metaMode.value]
)
function toggleMeta() {
  const order: Array<'off' | 'inline' | 'below'> = ['off', 'inline', 'below']
  metaMode.value = order[(order.indexOf(metaMode.value) + 1) % order.length]
}

// —— 侧边消息条：一条消息一根短横条 —— //
// 三档循环：关 / 按长度 / 按角色，顺便把两种取宽策略都演示到
const railMode = ref<'off' | 'length' | 'role'>('length')
const messageRailConfig = computed<MessageRailConfig>(() => ({
  enable: railMode.value !== 'off',
  widthBy: railMode.value === 'role' ? 'role' : 'length'
}))
const railModeLabel = computed(
  () => ({ off: '关', length: '按长度', role: '按角色' })[railMode.value]
)
function toggleRail() {
  const order: Array<'off' | 'length' | 'role'> = ['off', 'length', 'role']
  railMode.value = order[(order.indexOf(railMode.value) + 1) % order.length]
}

/**
 * 演示用：按正文长度反推一个「像真的」token 数，让元信息有数可看。
 *
 * 真实项目请直接用接口返回的 usage —— 各家字段名不同，组件库不做估算：
 * 估算出来的数字看着像真的，但会误导用户，比不显示更糟。
 */
function mockUsage(msg: ChatMessage): TokenUsage {
  const prompt = 26
  // reasoning 在多数厂商的实现里也算进 completion_tokens
  const completionChars = (msg.reasoning?.length ?? 0) + (msg.content?.length ?? 0)
  const completion = Math.max(12, Math.round(completionChars / 2.2))
  return {
    prompt,
    completion,
    total: prompt + completion,
    reasoning: msg.reasoning ? Math.round(msg.reasoning.length / 2.4) : undefined
  }
}

/** 收尾：补上演示用的 token 数再 finish（耗时由 useStreaming 自己算） */
function finishWithUsage(msg: ChatMessage) {
  msg.meta = { ...(msg.meta ?? {}), usage: mockUsage(msg) }
  streaming.finish(msg)
}

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

// —— 停止生成 ——
// 置位后，正在跑的流式循环会在下一次 sleep 时抛哨兵错误，借此中断。
// 真实项目里这里应该换成 AbortController.abort() 中断 fetch。
const ABORT_SENTINEL = '__aborted__'
let abortRequested = false

function sleep(ms: number) {
  return new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      if (abortRequested) reject(new Error(ABORT_SENTINEL))
      else resolve()
    }, ms)
  })
}

function onStop() {
  abortRequested = true
}

/** 统一收尾：用户主动停止按「完成」处理（保留已经产出的内容），只有真错误才标记失败 */
function settle(msg: ChatMessage, e: unknown) {
  if (e instanceof Error && e.message === ABORT_SENTINEL) {
    msg.reasoningStatus = 'done'
    finishWithUsage(msg)
    const tail = '\n\n*（已停止生成）*'
    msg.content = msg.content ? msg.content + tail : tail.trim()
  } else {
    streaming.fail(msg, (e as Error).message || '模拟失败')
  }
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
  } else if (text === '帮我排查一下项目报错') {
    await runMultiToolCallDemo(assistant)
  } else if (text === '帮我分析一下这段超长思考过程') {
    await runLongThinkingDemo(assistant)
  } else {
    await runMockStream(assistant, text)
  }
}

function onSelect(q: PresetQuestion) {
  if (q.id === 'q8') {
    seedMultiTurnDemo()
    return
  }
  onSend({ text: q.prompt, files: [] })
}

/**
 * 演示用：一次性铺出一段多轮对话，好让左侧那列消息条有内容可看。
 * 问答长度刻意长短不一，用来对比「按长度取宽」与「按角色取宽」两种策略。
 */
function seedMultiTurnDemo() {
  const turns: Array<[string, string]> = [
    ['组件库支持哪些能力？', '支持流式输出、思考过程折叠、Markdown 渲染（Shiki 代码高亮）、附件上传、工具调用折叠、浅色/深色双主题。'],
    ['流式怎么接入？', '用 useStreaming() 创建 assistant 消息，逐块 append 即可；组件会自动区分 content 与 reasoning 两个通道。'],
    ['主题怎么配？', '传 theme="light" | "dark" | "auto" 三选一，auto 跟随系统。底层是 CSS 变量，可以深度定制。'],
    ['长思考会不会把气泡撑爆？', '不会。思考正文默认有 320px 高度上限，超出后内部滚动，流式输出时还会自动贴底跟随；你手动往上滚之后跟随暂停，滚回底部自动恢复。'],
    ['附件呢？', '支持点击与拖拽，图片出缩略图、其他文件出卡片，都可以移除；图片还能点击放大预览。'],
    ['这一条是故意写长的提问，用来验证侧边条在「按长度取宽」时，能不能把长提问也画成明显更长的一根，从而让整段对话的节奏一眼可辨。', '收到。这条回答同样偏长，方便和上面的短回答形成对比 —— 你会看到侧边条里长答案的那几根明显更长。']
  ]
  const now = Date.now()
  messages.value = turns.flatMap(([question, answer], i) => [
    { id: `seed-u${i}`, role: 'user' as const, content: question, status: 'done' as const, createdAt: now },
    { id: `seed-a${i}`, role: 'assistant' as const, content: answer, status: 'done' as const, createdAt: now }
  ])
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
  // 计时状态必须一起清掉，否则新一次生成算出来的耗时是从上一次开始算的
  resetStreamTiming(msg)
  runMockStream(msg, '重新生成')
}

// —— 演示：超长思考过程（验证正文超高后内部滚动） ——
async function runLongThinkingDemo(msg: ChatMessage) {
  busy.value = true
  abortRequested = false
  try {
    await sleep(400)
    msg.status = 'streaming'
    msg.reasoningStatus = 'streaming'
    for (const ch of buildLongReasoning()) {
      streaming.append(msg, { type: 'reasoning', delta: ch })
      await sleep(3)
    }
    msg.reasoningStatus = 'done'
    await sleep(260)

    const content =
      '上面这段思考有三千多字，但**卡片高度被 320px 上限截住了**，正文在内部滚动。\n\n' +
      '- 流式期间会自动贴底跟随\n' +
      '- 你手动往上滚之后跟随暂停，滚回底部又会恢复\n' +
      '- 滚动到边界不会把外层消息列表一起带走\n\n' +
      '如果不想被截断，传 `:thinking-config="{ scrollable: false }"` 即可恢复成全部铺开。'
    for (const ch of content) {
      streaming.append(msg, { type: 'content', delta: ch })
      await sleep(12)
    }
    finishWithUsage(msg)
  } catch (e) {
    settle(msg, e)
  } finally {
    busy.value = false
  }
}

// 故意写长，用来触发思考正文的滚动
function buildLongReasoning(): string {
  return [
    "用户想知道这段思考为什么这么长。先理一下需要交代的点：高度上限、内部滚动、流式跟随、以及怎么关掉。",
    "我应该先给出一段足够长的思考内容，长到超过 320px 的默认上限，否则滚动效果根本看不出来。",
    "写多长合适？按 18px 行高、每行约 60 字符估算，320px 大概能放十来行；要让人一眼看出被截住，最好写到四五十行。",
    "内容本身也得像真的推理过程，不能是纯占位文本，否则看演示的人会以为组件坏了。",
    "那就照着一次真实的排查过程写：先看项目结构，再看依赖版本，然后逐个确认配置文件，最后给结论。",
    "第一步，确认 node 和 npm 版本。这个信息决定了后面能不能用某些新语法，以及依赖的 engines 约束满不满足。",
    "第二步，看 node_modules 是否存在。不存在的话就得先装依赖，那就得多等一会儿，这时最好给个流式提示。",
    "顺带确认一下 lockfile 的格式，pnpm-lock 还是 package-lock，两种包管理器的行为差异会影响后续命令的选择。",
    "第三步，检查 .env 这类本地配置。很多构建脚本会读它，缺了就直接报 file not found，而且报错位置往往很隐蔽。",
    "如果 .env 缺失但没有 .env.example 可以复制，那就得回头问用户要，不能自己瞎编一个，否则跑出来的结果没意义。",
    "第四步，确认 .gitignore 有没有把 .env 排除掉。这个和第三步是两件事：一个是文件在不在，一个是被不被跟踪。",
    "第五步，看构建配置里有没有额外的资源声明，比如 extraResources，这类路径是字面匹配的，文件不存在就会抛错。",
    "第六步，检查代理和镜像设置。在国内的网络环境下，默认 registry 经常超时，但直接换镜像又可能和 lockfile 里的 resolved 地址冲突。",
    "这里有个细节值得留意：lockfile 里记录的是完整的 tarball 地址，所以只改 registry 未必生效，得看包管理器是否严格遵循 lockfile。",
    "第七步，确认构建脚本里有没有预设镜像变量。如果脚本自己设置了镜像地址，那说明作者本来就考虑了网络问题，先按原样跑。",
    "最后，把所有不确定项列出来，按「会直接导致失败」和「只是可能变慢」分两类，先解决前一类。",
    "结论：先装依赖，再补 .env，然后跑一次构建看真实报错。不要在没有任何报错信息的情况下凭猜测改配置。",
    "对了，还得提醒一句：如果构建耗时很长，记得把命令超时时间调大，否则会被中途掐断，看到的日志也是不完整的。",
    "思考到这里应该够长了。接下来把结论整理成正文回答，注意别再重复这一大段推理。"
  ].join('\n\n')
}

// —— mock 流式：先输出 reasoning，再输出 content ——
async function runMockStream(msg: ChatMessage, _userText: string) {
  busy.value = true
  abortRequested = false
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
    finishWithUsage(msg)
  } catch (e) {
    settle(msg, e)
  } finally {
    busy.value = false
  }
}

// —— 演示：工具调用全流程（reasoning → running → done + 结果 → 正文） ——
async function runToolCallDemo(msg: ChatMessage) {
  busy.value = true
  abortRequested = false
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
    finishWithUsage(msg)
  } catch (e) {
    settle(msg, e)
  } finally {
    busy.value = false
  }
}

// —— 演示：一条消息里连续出现大量工具调用（验证默认折叠为「只展示最新一个」） ——
async function runMultiToolCallDemo(msg: ChatMessage) {
  busy.value = true
  abortRequested = false
  try {
    await sleep(400)
    msg.status = 'streaming'

    msg.reasoningStatus = 'streaming'
    const reasoning = '项目报错涉及多个文件，先定位 TailwindCSS 版本冲突，再逐一读取相关配置。'
    for (const ch of reasoning) {
      streaming.append(msg, { type: 'reasoning', delta: ch })
      await sleep(6)
    }
    msg.reasoningStatus = 'done'
    await sleep(160)

    const steps: Array<{ name: string; argsPreview: string; result?: string }> = [
      { name: 'list_files', argsPreview: 'path=./', result: 'src/  vite.config.ts  package.json  index.html' },
      { name: 'read_file', argsPreview: 'path=package.json', result: '{\n  "dependencies": { "tailwindcss": "^4.0.0" }\n}' },
      { name: 'run_command', argsPreview: 'npx tailwindcss -v', result: 'tailwindcss v4.0.0' },
      { name: 'run_command', argsPreview: 'npm ls tailwindcss', result: '└── tailwindcss@4.0.0' },
      { name: 'read_file', argsPreview: 'path=vite.config.ts', result: 'export default defineConfig({ plugins: [vue()] })' },
      { name: 'grep_search', argsPreview: 'pattern=@tailwind', result: 'src/styles/index.scss:  @tailwind base;' },
      { name: 'read_file', argsPreview: 'path=src/styles/index.scss', result: '@tailwind base;\n@tailwind components;' },
      { name: 'write_file', argsPreview: 'path=src/styles/index.scss', result: 'ok' },
      { name: 'run_command', argsPreview: 'npm run dev', result: 'ready in 421 ms' },
      { name: 'read_file', argsPreview: 'path=src/main.ts', result: 'import "./styles/index.scss"' },
      { name: 'run_command', argsPreview: 'npm run build', result: 'built in 3.20s' },
      { name: 'read_file', argsPreview: 'path=src/components/App.vue', result: '<template>...</template>' }
    ]

    // 1) 先一次性挂上 running 列表（模拟模型一次性下发多个 tool_call）
    msg.toolCalls = steps.map((s) => ({
      id: uid('tc'),
      name: s.name,
      argsPreview: s.argsPreview,
      arguments: s.argsPreview,
      status: 'running' as const
    }))

    // 2) 逐个完成，模拟真实执行节奏
    for (let i = 0; i < steps.length; i++) {
      await sleep(220)
      const tc = msg.toolCalls[i]
      tc.status = 'done'
      tc.result = steps[i].result
    }

    await sleep(240)
    const content =
      '排查完成：根因是 **TailwindCSS v4** 的 `@tailwind` 指令在 v4 中已废弃，\n\n' +
      '已在 `src/styles/index.scss` 中改为 `@import "tailwindcss";`，构建通过 ✅'
    for (const ch of content) {
      streaming.append(msg, { type: 'content', delta: ch })
      await sleep(8)
    }
    finishWithUsage(msg)
  } catch (e) {
    settle(msg, e)
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
