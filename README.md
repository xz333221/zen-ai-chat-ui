# zen-ai-chat-ui

一个精美的大模型对话 UI 组件库，基于 Vue 3 + TypeScript。支持流式输出、思考过程折叠、Markdown 渲染（Shiki 代码高亮）、附件上传、工具调用折叠、浅色/深色双主题。可发布到 NPM，供其他项目安装复用。

## 特性

- **流式输出**：逐字渲染 + 光标，支持 `content` / `reasoning` 双通道分片
- **停止生成**：生成中发送按钮自动变停止按钮，点击抛 `stop` 事件，由业务侧中断请求
- **向用户提问**：内置提问面板（单选点击即提交 / 多选勾选后提交 / 可选自由输入），适合 agent 中途停下来向用户要一个选择
- **会话列表**：独立的 `ConversationList`（搜索 / 新建 / 行内重命名 / 删除事件 + 生成中徽标、来源角标、紧凑模式），和 `ChatContainer` 并排就是完整的对话应用骨架；窄到放不下两列时，演示页会自动切成「列表页 ↔ 对话页」两页，输入框则用 `showInput=false` 拆出来常驻在卡片最下方，**列表页也有一条**（VSCode 那种感觉）
- **输入框可拆**：`ChatContainer` 传 `showInput=false` 就不渲染内置输入框，改由宿主用导出的 `ChatInput` 自己摆位；整个应用只挂一个实例，切页时草稿与待发附件都还在
- **思考过程**：独立的可折叠「思考中」区块，流式时展开 + 动画，完成后折叠；正文超高时内部滚动，不会把气泡撑得老长（滚动条默认悬停才淡入，不干扰阅读）
- **工具调用**：默认把同一条消息里的多个调用折叠成一组、只展示最新一个，点击可展开全部
- **消息操作栏**：气泡下方内置纯图标「复制」（提问 + 回答）与「重新生成」（回答），悬停该条消息才显示，复制带绿色对勾 + 浮层提示
- **运行元信息**：可选在气泡下方展示回答耗时、首字延迟、token 用量（`1.2s · 510ms · ↑26 ↓571`），耗时由 `useStreaming` 自动计时；与操作栏同步悬停显示（可设常显）
- **Markdown 渲染**：基于 markdown-it + Shiki，双主题代码高亮、表格、引用、任务列表，代码块带语言标签与一键复制
- **附件上传**：点击 / 拖拽，图片缩略图 + 文件卡片，可移除；图片点击可放大预览（灯箱：左右切换 / 键盘导航 / 点背景关闭）
- **消息侧边条**：消息列表左边缘一列短横条，**一轮问答一根**，条宽反映这一轮的篇幅；静止时低透明不打扰，悬停浮出「提问 + 回答摘要」，点击跳到该轮提问
- **开场白 + 预设问题**：首屏欢迎语 + 可点击的话题卡片
- **内容列宽度可配**：开场白、消息列表、输入框共享同一个 `maxWidth`。默认 `min(100%, 920px)`——窄容器跟随容器，宽屏截断居中，不会再出现「开场白 640 / 消息 768」那种对不齐，也不会在 4K 屏上把一行文字拉成两米宽
- **双主题**：浅色 / 深色 / 跟随系统，通过 CSS 变量驱动，可深度定制
- **样式自洽**：所有组件带 `acu-` 前缀，CSS 变量作用域隔离，不污染宿主
- **令牌收敛**：字号 / 间距 / 圆角 / 动效 / 状态色全部走 `--acu-*` 令牌，组件内不写死色值与尺寸；正文轮次间距、气泡列宽、过渡节奏都能一处改全局生效
- **可访问性**：可交互元素带 `:focus-visible` 焦点环，过渡属性显式声明（不用 `transition: all`），`prefers-reduced-motion` 下自动关闭动画

## 安装

```bash
npm install zen-ai-chat-ui
# 或
pnpm add zen-ai-chat-ui
```

`vue` 为 peerDependency，需 >= 3.3。`markdown-it` 与 `shiki` 为 dependency，会自动安装。

## 快速开始

```ts
import { createApp } from 'vue'
import App from './App.vue'
import 'zen-ai-chat-ui/style.css'

createApp(App).mount('#app')
```

```vue
<template>
  <ChatContainer
    :messages="messages"
    :preset-questions="questions"
    theme="light"
    @send="onSend"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ChatContainer, useStreaming, uid, type ChatMessage, type StreamChunk } from 'zen-ai-chat-ui'

const messages = ref<ChatMessage[]>([])
const streaming = useStreaming()

const questions = [
  { id: 'q1', label: '介绍一下你自己', prompt: '介绍一下你自己' }
]

async function onSend({ text, files }: { text: string; files: any[] }) {
  messages.value.push({
    id: uid('u'), role: 'user', content: text, status: 'done',
    attachments: files.map(f => ({ id: f.id, name: f.file.name, size: f.file.size, type: f.file.type, preview: f.preview }))
  })

  const assistant = streaming.createAssistant()
  messages.value.push(assistant)

  // 调用大模型接口，逐块 append
  for await (const chunk of callLLM(text)) {
    streaming.append(assistant, chunk as StreamChunk)
  }
}
</script>
```

## 流式输出

`useStreaming().append(message, chunk)` 按 `chunk.type` 分发：

| type        | delta         | 说明                     |
| ----------- | ------------- | ------------------------ |
| `reasoning` | 思考增量文本   | 写入 `message.reasoning` |
| `content`   | 正文增量文本   | 写入 `message.content`   |
| `done`      | -             | 标记完成                 |
| `error`     | -             | 标记错误                 |

首个 `content` 到达时，`reasoning` 自动标记为完成。

## 停止生成

生成过程中，输入框右侧的按钮会从「发送」变成「停止」，点击抛出 `stop` 事件，真正的中断由业务侧决定：

![输入框的发送按钮变为停止按钮](docs/input-stop-button.png)

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { ChatContainer } from 'zen-ai-chat-ui'

const busy = ref(false)
let aborter: AbortController | null = null

async function onSend({ text }: { text: string }) {
  busy.value = true
  aborter = new AbortController()
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ text }),
      signal: aborter.signal        // ← 关键：把 signal 交给 fetch
    })
    // ...流式读取 res.body 并 streaming.append()
  } finally {
    busy.value = false
    aborter = null
  }
}

function onStop() {
  aborter?.abort()                  // ← 真正中断请求
}
</script>

<template>
  <ChatContainer
    :messages="messages"
    :disabled="busy"
    :generating="busy"
    @send="onSend"
    @stop="onStop"
  />
</template>
```

组件本身不碰网络，`stop` 只是个信号。用 `fetch` 就传 `AbortController` 的 `signal`；用 SSE / WebSocket / 自研 SDK 就调各自的 `close()` / `cancel()`。

> 中断后组件不会把消息标成错误——已经产出的内容原样保留，由业务侧决定要不要补一句「（已停止生成）」之类的收尾文案。

### `disabled` 和 `generating` 是两件事

| 想要的交互 | 传什么 |
| --- | --- |
| 生成中锁住输入框（按钮变停止） | `:disabled="busy" :generating="busy"` |
| 生成中仍可继续输入下一条（按钮变停止） | 只传 `:generating="busy"` |
| 只是锁住输入，不要停止按钮 | 只传 `:disabled="busy"` |

第二种模式下 Enter 不会误发（`generating` 期间发送被拦掉），等生成结束再按 Enter 即可。

停止按钮用柔和的危险色：`--acu-error-soft` 作底、`--acu-error` 作图标色，覆盖这两个变量即可换色。

## 向用户提问

智能体中途需要用户拍板（`ask_user` 一类）时，把问题交给 `ChatContainer` 的 `question`，面板会出现在**消息列表与输入框之间**：

```vue
<ChatContainer
  :messages="messages"
  :question="pendingQuestion"          <!-- null 时不渲染 -->
  :question-submitting="submitting"    <!-- 提交请求飞行中：整体禁用，防重复提交 -->
  @answer="onAnswer"
/>
```

```ts
const pendingQuestion = ref<AskUserQuestion | null>({
  question: '你想让我接下来做点什么？',
  options: ['看看最近有哪些 Git 项目', '随便聊两句', '检查某个项目的代码'],
  multiple: false,        // 默认 false
  allowFreeText: true     // 默认 true；选项为空时恒为 true
})

// 单选 1 项；多选 N 项；自由输入的内容作为额外一项
function onAnswer(answers: string[]) {
  submit(answers).finally(() => { pendingQuestion.value = null })
}
```

交互约定：

- **单选**：点选项即提交（`answers = [所选选项]`），不必再点按钮
- **多选**：勾选若干项后点「提交回答」；自由输入的内容作为**额外一项**并入
- **提交中**：传 `questionSubmitting`，面板整体禁用；组件内部还有一层闩锁，防止请求回流前连点导致重复提交
- **失败重试**：`questionSubmitting` 从 `true` 回到 `false` 时闩锁自动放开，面板可再次提交
- **换问题**：`question` 变化时自动清空上一轮的勾选与输入

文案默认中文（`等待你的回答` / `输入回答` / `提交回答`），需要 i18n 就传 `questionLabels`：

```vue
<ChatContainer
  :messages="messages"
  :question="pendingQuestion"
  :question-labels="{ title: t('waiting'), placeholder: t('inputAnswer'), submit: t('submit') }"
/>
```

也可以单独用 `<AskUserPanel>`（自己摆放位置与动效）：

```vue
<AskUserPanel
  question="选一个目标分支"
  :options="['main', 'develop']"
  :submitting="submitting"
  @answer="onAnswer"
/>
```

## 思考过程

assistant 消息的 `reasoning` 字段会渲染成一个独立的可折叠「思考中」区块：流式时自动展开 + 三点动画 + 光标，完成后自动折叠。

模型的思考过程动辄几千字，**默认给正文加了 320px 的高度上限，超出后内部滚动**，避免把气泡撑到几千像素高、把真正的回答挤到屏幕外：

![思考块超出后内部滚动](docs/thinking-scroll.png)

滚动条默认**悬停时才淡入**，静止状态完全不干扰阅读（也可设为常显或彻底隐藏）：

![思考块悬停时滚动条淡入](docs/scrollbar-hover.png)

```
┌─────────────────────────────────────────┐
│ ◐ 思考中 •••                           │  ← 头部常驻，随时可折叠
├─────────────────────────────────────────┤
│ 先看看项目结构……                    ▐   │  ← 正文：超出 320px 后内部滚动
│ Node v26.9.0，client engines 要求……  ▐   │
│ ……                                      │
└─────────────────────────────────────────┘
```

流式输出时正文会**自动贴底**跟随新内容；用户手动往上滚查看前文后跟随暂停，滚回底部自动恢复。滚动到边界不会把外层消息列表一起带走（`overscroll-behavior: contain`）。

### `ThinkingConfig` 字段

| 字段            | 类型      | 默认值  | 说明 |
| --------------- | --------- | ------- | ---- |
| `scrollable`    | `boolean` | `true`  | 正文超出高度上限时是否内部滚动；设 `false` 恢复为全部铺开 |
| `maxHeight`     | `number`  | `320`   | 正文最大高度（px） |
| `followStream`  | `boolean` | `true`  | 流式输出时是否自动贴底跟随 |
| `scrollbar`     | `'hover' \| 'always' \| 'hidden'` | `'hover'` | 正文滚动条显隐策略：悬停淡入 / 常显 / 完全隐藏（滚动能力都保留） |
| `defaultExpanded` | `boolean` | -     | 初始是否展开；不传则沿用默认（streaming 展开、完成折叠） |

```vue
<!-- 默认：320px 上限 + 内部滚动 + 流式跟随 -->
<ChatContainer :messages="messages" @send="onSend" />

<!-- 更长一些，且不要自动跟随（让用户自己滚） -->
<ChatContainer
  :messages="messages"
  :thinking-config="{ maxHeight: 480, followStream: false }"
  @send="onSend"
/>

<!-- 恢复旧行为：思考全部铺开 -->
<ChatContainer
  :messages="messages"
  :thinking-config="{ scrollable: false }"
  @send="onSend"
/>

<!-- 滚动条常显（默认是悬停才淡入） -->
<ChatContainer
  :messages="messages"
  :thinking-config="{ scrollbar: 'always' }"
  @send="onSend"
/>

<!-- 彻底不要滚动条（仍可滚动，只是不显示） -->
<ChatContainer
  :messages="messages"
  :thinking-config="{ scrollbar: 'hidden' }"
  @send="onSend"
/>
```

也可以单独用 `<ThinkingBlock>`：

```vue
<ThinkingBlock :content="msg.reasoning" :streaming="true" :config="{ maxHeight: 240 }" />
```

> 跑 `npm run dev` 后点预设里的「超长思考滚动」可以直接看到效果（含流式贴底跟随）。

> `scrollbar: 'hover'` 为什么不是纯 CSS？因为 Blink 在祖先 `:hover` 状态变化时**不会重算** `::-webkit-scrollbar-thumb` 的样式（`&:hover::-webkit-scrollbar-thumb` 实测无效），所以组件内部用 `mouseenter/mouseleave` 切一个 `is-scrollbar-visible` 类来驱动。这是经验证的实现细节，正常使用无需关心。

## 会话列表

`ConversationList` 把"一段段对话"按列表呈现（新建 / 搜索 / 选中 / 重命名 / 删除），和 `ChatContainer` 并排就是完整的对话应用骨架：

```vue
<div style="display: flex; height: 100%">
  <aside style="width: 260px">
    <ConversationList
      :items="conversations"
      :active-id="activeId"
      :loading="loading"
      @select="openConversation"
      @new="createConversation"
      @rename="renameConversation"
      @delete="confirmDelete"
    />
  </aside>
  <ChatContainer :messages="messages" @send="onSend" />
</div>
```

```ts
const conversations = ref<ConversationItem[]>([
  { id: 'c1', title: '组件库能力总览', meta: '今天 · 12 条', badge: 'CLI' },
  { id: 'c2', title: '流式输出怎么接', meta: '昨天 · 6 条', generatingText: '正在生成中...' }
])
```

设计口径：

- **纯展示组件**：列表数据与选中态由消费方持有，组件只抛事件；**删除只抛 `delete`**，确认弹窗由消费方做（组件不内置弹窗）
- **搜索在组件内过滤**：按 `title` + `searchText`（可放模型名等不展示字段）匹配；传 `:show-search="false"` 可关掉
- **行内重命名**：点铅笔或双击条目进入编辑，Enter / 失焦提交、Esc 取消；标题没变或为空则不抛事件
- **时间等文案由消费方格式化**：库不做相对时间与 i18n，`meta` / `generatingText` / `badge` 都是现成字符串（要 i18n 就传 `labels`）
- **紧凑模式** `compact`：更小行高与字号，适合窄面板 / 侧栏
- 选中项用主色软底 + 左侧 3px 竖条；操作按钮悬停或聚焦时才显形；`activeId` 变化时当前项自动滚进视野

| Prop         | 类型                          | 默认值  | 说明 |
| ------------ | ----------------------------- | ------- | ---- |
| `items`      | `ConversationItem[]`          | -       | 会话列表（必填） |
| `activeId`   | `string \| null`              | `null`  | 当前选中的会话 id |
| `loading`    | `boolean`                     | `false` | 加载中（列表为空时显示 loading 文案） |
| `showSearch` | `boolean`                     | `true`  | 是否展示搜索框 |
| `showNew`    | `boolean`                     | `true`  | 是否展示新建按钮 |
| `compact`    | `boolean`                     | `false` | 紧凑模式（窄面板 / 侧栏） |
| `labels`     | `Partial<ConversationListLabels>` | -   | 文案覆盖（走 i18n 时用） |

| Event    | Payload                                | 说明 |
| -------- | -------------------------------------- | ---- |
| `select` | `(id: string, item: ConversationItem)` | 选中某条会话 |
| `new`    | -                                      | 点击新建 |
| `rename` | `(id: string, title: string)`          | 提交重命名（仅新标题非空且变化时触发） |
| `delete` | `(id: string, item: ConversationItem)` | 请求删除（确认弹窗由消费方负责） |

> 跑 `npm run dev` 后，配置面板里「会话列表」一组可以开关列表、切紧凑模式、给首项加"生成中"徽标；点选 / 新建 / 重命名 / 删除都会即时作用在左侧那份演示数据上。

### 窄屏怎么办：分两页，而不是硬挤

`ConversationList` 是纯展示组件，**本身不做响应式**——并排还是分页是宿主的版面决策，库不该替宿主定断点。但窄屏下别把 260px 的侧栏硬塞进 400px 的容器：挤到最后两列都没法看。推荐「列表页 ↔ 对话页」两个页面，**输入框拆出来常驻在底部**（VSCode 那种感觉：换的是中间区，输入框一直在）：

```vue
<template>
  <!--
    主题 / 盒模型 / 列宽都挂在这一层：它是拆出去的输入框能蹭到的最近祖先。
    acu-root 是库的组件根类，盒模型重置（box-sizing: border-box）限定在它子树里。
  -->
  <div
    class="chat-app acu-root"
    :data-theme="resolvedTheme"
    :style="{ '--acu-max-width': maxWidth }"
  >
    <!-- 分页时顶部多一条页栏：返回按钮 + 当前页标题 -->
    <div v-if="split" class="pagebar">
      <button v-if="pane === 'chat'" @click="pane = 'list'">← 会话列表</button>
      <span>{{ pane === 'list' ? '会话列表' : activeTitle }}</span>
    </div>

    <!-- 中间区：列表页 / 对话页二选一 -->
    <div class="stage">
      <aside v-if="!split || pane === 'list'">
        <ConversationList :items="conversations" :active-id="activeId" @select="onSelect" @new="onNew" />
      </aside>
      <!-- 切页用 v-show：对话的滚动位置、流式中的消息要留着 -->
      <!-- show-input=false：输入框不在这里，拆到下面常驻 -->
      <ChatContainer
        v-show="!split || pane === 'chat'"
        :show-input="false"
        :messages="messages"
        :theme="theme"
      />
    </div>

    <!-- 输入框常驻最下方：对话页、会话列表页都有 -->
    <div class="composer">
      <ChatInput :generating="busy" @send="onSend" @stop="onStop" />
    </div>
  </div>
</template>
```

```ts
const pane = ref<'list' | 'chat'>('list')
// 判据用「容器宽度」而不是视口宽度：宿主页面的 padding、浏览器缩放变了都不用跟着改阈值
const split = computed(() => cfg.showList && containerWidth.value - 260 < 560)
watch(split, (now) => { if (now) pane.value = 'list' })   // 跨过阈值时落在列表页

function onSelect(id: string) { activeId.value = id; load(id); pane.value = 'chat' }
// 列表页也能发消息（输入框常驻），发完得跳到对话页，否则自己刚发的那条看不见
function onSend(p: { text: string; files: SelectedFile[] }) { pane.value = 'chat'; /* ... */ }

// 输入框已经不在 ChatContainer 里，'auto' 得自己解析一次，否则它会一路浅色
const resolvedTheme = useResolvedTheme(() => cfg.theme)
```

```css
/* 想和内置的那条长得一样，留白对齐 .acu-chat-footer */
.composer {
  flex-shrink: 0;
  padding: var(--acu-space-3) var(--acu-space-4) var(--acu-space-4);
  background: linear-gradient(to top, var(--acu-bg) 70%, transparent);
}
```

- **阈值看容器，不看视口**：`260（列表占用）+ 560（对话列的最小可用宽度）` 就是分界点。视口宽度只是近似值，容器宽度才是对话列真正拿到的。
- **切页用 `v-show`，列表用 `v-if`**：`ChatContainer` 一旦销毁，滚动位置、流式中的消息、附件预览全丢；`ConversationList` 重建反而正好（搜索框、滚动位置重置回干净状态）。
- **选中会话后自动进对话页**：`select` / `new` 里顺手把 `pane` 切到 `'chat'`，省一次点击。
- **只有列表真的在展示时才可能分页**：宿主关掉列表（`cfg.showList === false`）就没有「两页」可言，对话直接铺满。
- **`ChatInput` 全局只挂一个**：拆出来之后它不再跟着 `ChatContainer` 销毁重建，`列表页 ↔ 对话页` 来回切时草稿和待发附件都还在。

拆出输入框后有三件事必须自己接上，否则会出现「消息深色、输入框浅色」「两列左边缘差 16px」「输入框横着溢出父容器」：

| 要接的东西 | 怎么接 | 不接会怎样 |
| ---------- | ------ | ---------- |
| 主题 | 在共同祖先上挂 `:data-theme`（`'auto'` 用 `useResolvedTheme` 解析成 `'light' \| 'dark'`） | 拆出去的那层不在 `ChatContainer` 的 DOM 里，拿不到它解析好的主题；`'auto'` 时一路浅色 |
| 列宽 | 在共同祖先上写 `--acu-max-width`（`ChatContainer` 会继承，不用再传 `maxWidth` prop；想只改对话区就单独传 prop，两者同值时不会打架） | 输入框和消息列各走各的，左边缘对不齐 |
| 盒模型 | 共同祖先加 `acu-root` 类 | 库把 `box-sizing: border-box` 重置限定在 `.acu-root` 子树里（不污染宿主）。`ChatInput` 根节点是 `div`，缺了这层会退回 `content-box`，`width: 100%` 变成「100% + 左右 padding」，横着溢出父容器（`button` / `textarea` 有浏览器 UA 的 border-box 兜着，所以只有输入框会露馅） |

跟输入框一起「搬家」的还有这几个 prop / 事件：`placeholder`、`disabled`、`generating`、`send`、`stop`——拆出去后它们都归 `ChatInput`，`ChatContainer` 那边不用再传（`showInput=false` 时它也不会再读）。另外提问面板（`question`）仍留在 `ChatContainer` 里，也就是永远在常驻输入框的上方。

演示页就是这么做的：`main` 宽度减去列表宽度不足 560px 时自动分页（约等于视口 852px），用 `ResizeObserver` 量容器，所以缩放、改 padding 都会自动跟上；输入框始终在卡片最下方，列表页也在。

## 组件 API

### `<ChatContainer>`

主组件，组合消息列表、开场白、输入框。

| Prop                | 类型                       | 默认值     | 说明                  |
| ------------------- | -------------------------- | ---------- | --------------------- |
| `messages`          | `ChatMessage[]`            | -          | 消息列表（必填）      |
| `presetQuestions`   | `PresetQuestion[]`         | `[]`       | 预设问题              |
| `welcomeTitle`      | `string`                   | 见默认     | 开场白标题            |
| `welcomeDescription`| `string`                   | 见默认     | 开场白描述            |
| `assistantName`     | `string`                   | `'AI 助手'`| 模型名称              |
| `assistantAvatar`   | `string`                   | -          | 模型头像：图片 URL / data URL。想用内置品牌键名要先过 `resolveAvatar()`，见「内置 AI 品牌头像」 |
| `userAvatar`        | `string`                   | -          | 用户头像：图片 URL / data URL（同样支持 `resolveAvatar()`） |
| `showAvatar`        | `boolean`                  | `true`     | 是否显示头像          |
| `placeholder`       | `string`                   | 见默认     | 输入框占位文字        |
| `theme`             | `'light' \| 'dark' \| 'auto'` | `'light'`  | 主题                  |
| `disabled`          | `boolean`                  | `false`    | 禁用输入（生成中）    |
| `generating`        | `boolean`                  | `false`    | 生成中：发送按钮变停止按钮，点击抛 `stop` |
| `showInput`         | `boolean`                  | `true`     | 是否渲染内置输入框。传 `false` 时输入框由宿主自己摆（配合导出的 `ChatInput`），见「窄屏怎么办」 |
| `question`          | `AskUserQuestion \| null`  | `null`     | 向用户提问：非空时在消息列表与输入框之间渲染提问面板（详见上方） |
| `questionSubmitting`| `boolean`                  | `false`    | 提问面板是否正在提交（请求飞行中，面板整体禁用） |
| `questionLabels`    | `Partial<AskUserLabels>`   | -          | 提问面板文案覆盖（走 i18n 时用） |
| `uploadConfig`      | `Partial<UploadConfig>`    | `{}`       | 附件上传配置          |
| `followup`          | `FollowupInput`            | -          | 追问建议（详见下方）  |
| `toolCallsConfig`   | `ToolCallsConfig`          | -          | 工具调用展示配置（详见下方） |
| `thinkingConfig`    | `ThinkingConfig`           | -          | 思考块展示配置（详见下方） |
| `actionsConfig`     | `MessageActionsConfig`     | -          | 气泡下方操作栏配置（详见下方） |
| `messageMetaConfig` | `MessageMetaConfig`        | -          | 耗时 / token 元信息行配置（详见下方） |
| `messageRailConfig` | `MessageRailConfig`        | -          | 侧边消息条配置（详见下方） |
| `maxWidth`          | `string \| number`         | -          | 内容列最大宽度，一处管开场白 / 消息列表 / 输入框；不传走 `--acu-max-width` 令牌（`min(100%, 920px)`）（详见下方） |

| Event              | Payload                                                | 说明             |
| ------------------ | ------------------------------------------------------ | ---------------- |
| `send`             | `{ text: string; files: SelectedFile[] }`              | 用户发送         |
| `select`           | `PresetQuestion`                                       | 点击预设问题     |
| `retry`            | `ChatMessage`                                          | 重试失败消息     |
| `followup-select`  | `(question: PresetQuestion, source: ChatMessage)`      | 点击追问建议     |
| `stop`             | -                                                      | 点击输入框右侧「停止生成」 |
| `answer`           | `string[]`                                             | 用户回答了提问面板（单选 1 项、多选 N 项，自由输入作为额外一项） |

### 其他可独立使用的组件

`MessageList`、`MessageBubble`、`ThinkingBlock`、`ToolCallBlock`、`ToolCallGroup`、`MessageActions`、`MessageMeta`、`MessageRail`、`WelcomeScreen`、`ChatInput`、`AskUserPanel`、`ConversationList`、`MarkdownRenderer`、`FollowupSuggestions`、`ImagePreview` 均已导出，可单独使用。

单独用时记得给它们套一层 `.acu-root`：盒模型重置（`box-sizing: border-box`）和主题令牌都挂在这个类下面，库靠它做到「组件内样式自洽、不污染宿主」。少了这层，`div` 类的根节点会退回 `content-box`（`width: 100%` + padding 就横着溢出），深色主题也不会生效。

composable 也一并导出：`useStreaming`（流式接法见「流式输出」）、`useResolvedTheme`（把 `'auto'` 解析成 `'light' | 'dark'`，拆出输入框时要用，见「窄屏怎么办」）、`useMarkdown`。

### 内容列宽度与大屏适配（`maxWidth`）

开场白的内容区、消息列表、输入框在视觉上是**同一列**，三者必须共用同一个上限。通过 `ChatContainer` 的 `maxWidth` 一处配置：

```vue
<ChatContainer :messages="messages" />                     <!-- 不传：走令牌，默认 min(100%, 920px) -->
<ChatContainer :max-width="900" :messages="messages" />    <!-- 数字按 px -->
<ChatContainer max-width="60ch" :messages="messages" />    <!-- 字符串原样 -->
<ChatContainer max-width="100%" :messages="messages" />    <!-- 显式铺满容器 -->
```

- **默认 `min(100%, 920px)`**：窄容器（移动端、侧栏面板）下 `100%` 生效，与容器一致；宽屏下截到 920px 居中。
  既不铺满整个 4K 屏（一行文字横跨两米、推荐卡片的箭头飘到屏幕那头，整块看着「空」），也不至于缩在中间一小块。
- **数字**按 px 处理（`:max-width="900"` 与 `max-width="900px"` 等价）；字符串原样透传，`'60ch'`、`'72rem'` 也能用。
- 实现上是根节点注入一个 `--acu-max-width` CSS 变量，`WelcomeScreen` / `MessageList` / `ChatInput` / `MessageRail` 同时消费它。
  视觉上确实是同一列，就不会再出现列宽打架。
- **不传 `maxWidth` 时根节点不写这条 inline 变量**，于是回落到 `:root` 的 `--acu-max-width` 令牌。
  想全局改上限又不想碰模板，直接在宿主 CSS 里覆盖令牌即可（组件内传入的 `maxWidth` 仍然优先；
  令牌和组件里的是同权重选择器，靠加载顺序决定胜负，宿主样式一般排在 `ai-chat-ui/style.css` 之后，够用）：

  ```css
  .acu-chat { --acu-max-width: min(100%, 1080px); }
  ```

- 三列的左右 padding 都算在列宽**以内**（`.acu-message-list-inner` / `.acu-input-wrap` / `.acu-welcome-inner` 都是 `box-sizing: border-box`），
  所以列宽一致时三个盒子的左右边缘严格对齐。
- 侧边消息条（`messageRailConfig`）用 `calc` 贴住这一列的左边缘：大屏下内容列居中截断，它跟着列走，而不是留在屏幕最左边。
- **把输入框拆出去时（`showInput=false`），这一列要自己接上**：给常驻输入框那层写一份同样的 `--acu-max-width`，否则输入框和消息列各走各的，左边缘差一截。`ChatInput` 自己就是 `max-width: var(--acu-max-width); margin: 0 auto`，宿主只要把变量摆对位置。

## 附件与图片预览

用户上传的图片既可以出现在输入框待发送区，也可以出现在已发送的 user 气泡里。两处的图片缩略图都支持**点击放大预览**。

- 缩略图带 `cursor: zoom-in` 与 `role="button"`，可键盘聚焦（Enter / Space 打开）
- 灯箱通过 `Teleport` 挂到 `body`，不受宿主容器 `overflow` 裁剪
- 多图时显示左右切换按钮与 `当前 / 总数` 计数；支持键盘 `←` `→` 切换、`Esc` 关闭、点背景关闭
- 灯箱底色默认固定为深色半透明（这是图片查看器的通用惯例），**不跟随组件主题**；配色来自一组定义在裸 `:root`、不随 `[data-theme]` 变化的令牌，想换浅色灯箱覆盖 `--acu-overlay-scrim` / `--acu-overlay-text` / `--acu-overlay-surface` / `--acu-overlay-surface-hover` / `--acu-overlay-ring` / `--acu-overlay-shadow` 即可

![图片点击放大预览（灯箱）](docs/image-preview.png)

图片附件通过 `message.attachments`（`ChatAttachment[]`）的 `preview` 字段提供预览地址：

```ts
const attachments: ChatAttachment[] = files.map(f => ({
  id: f.id,
  name: f.file.name,
  size: f.file.size,
  type: f.file.type,
  preview: f.preview    // 图片才有，指向可加载的 URL / data URL
}))
```

也可以单独用 `<ImagePreview>`：

```vue
<ImagePreview
  v-model:visible="previewVisible"
  v-model:index="previewIndex"
  :images="[{ src: '/a.png', name: 'a.png' }, { src: '/b.png', name: 'b.png' }]"
/>
```

| Prop      | 类型             | 默认值 | 说明 |
| --------- | ---------------- | ------ | ---- |
| `visible` | `boolean`        | `false`| 是否显示（用 `v-model:visible` 双向绑定） |
| `images`  | `PreviewImage[]` | `[]`   | 图片列表：`{ src: string; name?: string }` |
| `index`   | `number`         | `0`    | 当前第几张（用 `v-model:index` 双向绑定） |

| Event            | 说明 |
| ---------------- | ---- |
| `update:visible` | 关闭 / 打开时回传 |
| `update:index`   | 切换图片时回传 |

> 跑 `npm run dev` 后，把图片拖进输入框或直接发送，点缩略图即可看到灯箱效果。

## 消息侧边条

长对话翻起来容易迷路，这列贴在消息列表左边缘的短横条就是一张"目录"：**一轮问答一根条**
（用户提问开启新的一轮，其后到下一个提问之前的消息都算这一轮），条数随轮次增长。

![消息侧边条](docs/message-rail.png)

- **条宽 = 这一轮的长度**（默认 `widthBy: 'length'`，对数缩放）：回答长的轮次明显更长，一段对话的节奏一眼可辨；流式输出时最后一根会跟着长出来，自带进度感
- **静止态低透明，悬停才显形**（`opacity: 0.3 → 1`），不读的时候不抢注意力
- **高亮跟随阅读位置**：以消息列表视口的垂直中心为基准，正在看的那一轮高亮
- **悬停浮出「提问 + 回答摘要」**（各 2 行钳制），用来定位而不用真去读

![悬停显示浮层](docs/message-rail-tip.png)

- **点击跳转**：平滑滚动到**这一轮的提问**处，落在视口顶部
- 深色主题自动跟随：

![深色主题下的消息侧边条](docs/message-rail-dark.png)

### `MessageRailConfig` 字段

| 字段            | 类型                  | 默认值      | 说明 |
| --------------- | --------------------- | ----------- | ---- |
| `enable`        | `boolean`             | `false`     | 是否启用。默认关闭——会话不长时它属于多余噪音，建议显式打开 |
| `widthBy`       | `'length' \| 'even'`  | `'length'`  | 条宽依据：按本轮长度（对数），或全部等宽 |
| `minWidth`      | `number`              | `8`         | 最短条宽（px） |
| `maxWidth`      | `number`              | `26`        | 最长条宽（px） |
| `barHeight`     | `number`              | `3`         | 条高（px） |
| `maxGap`        | `number`              | `10`        | 条间最大间距（px）。轮次多时自动压缩（下限 4px） |
| `maxHeight`     | `number`              | `320`       | 条组最大高度（px），超出后条组内部滚动并把当前条带回视野 |
| `idleOpacity`   | `number`              | `0.3`       | 静止态整体透明度；悬停或键盘聚焦时整组显形 |
| `showTooltip`   | `boolean`             | `true`      | 悬停单根条是否显示浮层 |
| `clickToScroll` | `boolean`             | `true`      | 点击条是否滚动到该轮提问 |

```vue
<!-- 按本轮长度取宽（默认） -->
<ChatContainer
  :messages="messages"
  :message-rail-config="{ enable: true }"
  @send="onSend"
/>

<!-- 全部等宽：只想看「聊了几轮」、不关心长短时更整齐 -->
<ChatContainer
  :messages="messages"
  :message-rail-config="{ enable: true, widthBy: 'even' }"
  @send="onSend"
/>

<!-- 更细更密，适合轮次很多的场景 -->
<ChatContainer
  :messages="messages"
  :message-rail-config="{ enable: true, barHeight: 2, maxGap: 6, idleOpacity: 0.2 }"
  @send="onSend"
/>
```

也可以单独用 `<MessageRail>`（它是 `position: absolute`，宿主需要有定位上下文）：

```vue
<div style="position: relative">
  <MessageRail :messages="messages" :active-id="activeId" :config="{ enable: true }" />
</div>
```

> 跑 `npm run dev` 后点预设里的「多轮对话（侧边条）」会一次铺出多轮对话，顶部「全部配置」面板里可切「按长度 / 等宽」。

## 工具调用

assistant 消息通过 `message.toolCalls` 携带工具调用列表：

```ts
const assistant = streaming.createAssistant()
assistant.toolCalls = [
  { id: 'tc1', name: 'read_file', argsPreview: 'path=package.json', status: 'running' }
]
// 执行完成后回填
assistant.toolCalls[0].status = 'done'
assistant.toolCalls[0].result = '{ "name": "my-app" }'
```

一条消息里连续出现十几个调用时，平铺会把气泡撑得很长。**默认行为**是自动折叠成一组、**只展示最新（最后一次）的调用**，点击组头即可展开全部：

```
┌───────────────────────────────────────────┐
│ ✓ ⧉ 已调用 12 个工具              全部 ⌄  │  ← 组头：聚合状态 + 数量
├───────────────────────────────────────────┤
│ ✓ 🔧 read_file  path=src/App.vue      ⌄  │  ← 折叠态只保留最新一个
└───────────────────────────────────────────┘
```

组头状态聚合规则：有调用在跑显示 `正在调用工具 3/12`；全部结束显示 `已调用 12 个工具`；有失败追加 `· 2 个失败`。

### `ToolCallsConfig` 字段

| 字段                 | 类型      | 默认值  | 说明 |
| -------------------- | --------- | ------- | ---- |
| `group`              | `boolean` | `true`  | 是否折叠成组；设为 `false` 恢复为平铺渲染全部调用 |
| `collapseThreshold`  | `number`  | `2`     | 调用数量达到该值时才折叠（最小生效值 2）；只有 1 个调用时不会出现组头 |
| `defaultExpanded`    | `boolean` | `false` | 折叠组默认是否展开 |

```vue
<!-- 默认：折叠，只展示最新一个 -->
<ChatContainer :messages="messages" @send="onSend" />

<!-- 平铺：全部调用一次列出 -->
<ChatContainer :messages="messages" :tool-calls-config="{ group: false }" @send="onSend" />

<!-- 5 个以上才折叠，且默认展开 -->
<ChatContainer
  :messages="messages"
  :tool-calls-config="{ collapseThreshold: 5, defaultExpanded: true }"
  @send="onSend"
/>
```

### 单独使用 `<ToolCallGroup>`

```vue
<ToolCallGroup :tool-calls="msg.toolCalls ?? []" :config="{ defaultExpanded: true }" />
```

## 消息操作栏

每条消息气泡下方有一排**纯图标**按钮，默认隐藏，**鼠标悬停到该条消息上才会淡入**：

- **复制**（图标）：`user` 与 `assistant` 消息都有，复制的是 Markdown 原文；assistant 会自动剥离 `<think>` 思考段，只复制可见答案。复制成功后图标变绿色对勾，并冒一个「已复制」浮层提示（默认停留 1.6s）。
- **重新生成**（图标）：仅 `assistant` 消息，默认**只出现在最后一条**回答上，且流式进行中会隐藏。点击后抛出 `retry` 事件，由业务侧决定如何重跑。

两个按钮都带 `title` 与 `aria-label`，纯图标也不影响可访问性。

```vue
<ChatContainer
  :messages="messages"
  @send="onSend"
  @retry="(msg) => regenerate(msg)"
/>
```

> **显隐规则**：只在支持 hover 的设备（`@media (hover: hover)`）上做悬停隐藏；触摸设备没有 hover，按钮会一直可见，否则用户永远点不到。键盘 `Tab` 聚焦到按钮时同样会显示（`:focus-within`）。

### `MessageActionsConfig` 字段

| 字段              | 类型      | 默认值   | 说明 |
| ----------------- | --------- | -------- | ---- |
| `enable`          | `boolean` | `true`   | 是否显示整条操作栏；设 `false` 全部隐藏 |
| `copy`            | `boolean` | `true`   | 是否显示「复制」 |
| `retry`           | `boolean` | `true`   | 是否显示「重新生成」 |
| `retryOnlyLast`   | `boolean` | `true`   | 只挂在最后一条 assistant 上；设 `false` 则历史回答也显示 |
| `copiedDuration`  | `number`  | `1600`   | 「已复制」提示停留时长（毫秒） |

```vue
<!-- 关闭整个操作栏 -->
<ChatContainer :messages="messages" :actions-config="{ enable: false }" />

<!-- 只保留复制，且历史回答也给重新生成 -->
<ChatContainer
  :messages="messages"
  :actions-config="{ retryOnlyLast: false }"
/>
```

> 复制优先使用 `navigator.clipboard`（要求 HTTPS / localhost 等安全上下文），不可用时自动退回 `textarea + execCommand`，兼容 http 内网部署。错误态消息仍在气泡内保留「重试」按钮，操作栏不再重复。

### 单独使用 `<MessageActions>`

`MessageActions` 自身不带悬停隐藏逻辑（那由父容器决定），独立使用时常显：

```vue
<MessageActions role="assistant" :copy-text="answer" :show-retry="true" @retry="onRetry" />
```

## 运行元信息（耗时 / token）

在气泡下方多出一行 `21s · 510ms · ↑26 ↓571`，告诉你这次回答花了多久、吐了多少 token。

![消息元信息](docs/message-meta.png)

**默认关闭**，需要显式打开——它是新增的可见元素，默认打开会让所有既有页面的每条消息都多一行：

```vue
<ChatContainer
  :messages="messages"
  :message-meta-config="{ enable: true }"
  @send="onSend"
/>
```

### 耗时是自动的，token 不是

耗时不需要你做任何事：`useStreaming` 在 `createAssistant` 时记下 `createdAt`，第一个分片到达时记下 `firstTokenAt`，`finish()` 时记下 `finishedAt` 并把折算结果写进 `message.meta`。

**token 必须你自己塞**，因为它只能来自接口响应（OpenAI 用 `usage.prompt_tokens`，Anthropic 用 `usage.input_tokens`，字段名各家不同）：

```ts
const assistant = streaming.createAssistant()
messages.value.push(assistant)

const res = await fetch('/api/chat', { method: 'POST', signal: ctrl.signal, body })
for await (const chunk of parseSSE(res)) {
  streaming.append(assistant, chunk)
}

// 流结束后通常还会来一个带 usage 的收尾事件
assistant.meta = {
  ...(assistant.meta ?? {}),
  usage: {
    prompt: usage.prompt_tokens,
    completion: usage.completion_tokens,
    total: usage.total_tokens,
    reasoning: usage.completion_tokens_details?.reasoning_tokens,
    cached: usage.prompt_tokens_details?.cached_tokens
  }
}
streaming.finish(assistant)
```

> 组件库**不做 token 估算**。按字符数猜出来的数字看着像真的，但会误导用户，比不显示更糟。

### `MessageMetaConfig` 字段

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `enable` | `boolean` | `false` | 是否展示元信息行 |
| `items` | `MessageMetaItem[]` | `['duration', 'tokens']` | 展示哪些项，按数组顺序渲染。可选 `duration`（耗时）/ `firstToken`（首字延迟）/ `tokens` / `time`（发送时间） |
| `position` | `'inline' \| 'below'` | `'inline'` | `inline` 与操作栏同一行、`below` 单独占一行 |
| `showForUser` | `boolean` | `false` | 是否也给 user 消息显示（user 侧通常只有 `time` 有意义） |
| `visibility` | `'always' \| 'hover'` | `'hover'` | 显隐时机。`hover` 与操作栏一致：悬停该条消息 / 键盘聚焦才淡入；`always` 常显 |

> **显隐规则**：元信息和操作栏在同一行，默认都走「悬停才淡入」，**一起出现、一起消失**——避免出现「一个常驻、一个浮现」的参差感。同样是 `opacity` 切换，盒子一直在，不产生布局抖动。

![元信息默认悬停显示：上为不悬停（两者都隐藏），下为悬停（同时淡入）](docs/message-meta-hover.png)

> 触摸设备（`@media (hover: none)`）上 `'hover'` 会自动退化为常显：没有悬停这个动作，藏起来等于用户永远看不到。这一条对操作栏和元信息同样适用。
>
> 不想让它藏，传 `visibility: 'always'`：

```vue
<!-- 元信息常显（和旧版行为一致） -->
<ChatContainer
  :messages="messages"
  :message-meta-config="{ enable: true, visibility: 'always' }"
  @send="onSend"
/>
```

### 改展示内容

```vue
<!-- 只留「首字延迟 + token」，换行排布，user 侧也显示发送时间 -->
<ChatContainer
  :messages="messages"
  :message-meta-config="{
    enable: true,
    items: ['firstToken', 'tokens', 'time'],
    position: 'below',
    showForUser: true
  }"
/>
```

### 附加自定义项

`meta.extra` 里的内容会原样追加到末尾，用来塞模型名、检索命中数这类业务字段：

```ts
assistant.meta = {
  ...assistant.meta,
  extra: [{ label: '模型', value: 'MiniMax-M3', title: '本次使用的模型' }]
}
```

渲染结果：`21s · 510ms · ↑26 ↓571 · 模型 MiniMax-M3`

### 逐字段自定义消息

不用 `useStreaming` 也可以，直接把时间戳和用量写在消息对象上：

```ts
messages.value.push({
  id: 'a1',
  role: 'assistant',
  content: answer,
  status: 'done',
  createdAt: t0,          // 可选：不传则耗时项不显示
  finishedAt: t1,
  firstTokenAt: t0 + 510,
  meta: { usage: { prompt: 26, completion: 571 } }
})
```

> 耗时优先取 `meta.durationMs`，其次用 `finishedAt - createdAt` 推导。两者都没有时该项自动隐藏，不会显示 `NaN`。

### 「重新生成」要清计时状态

只重置 `content` 会让旧的 `finishedAt` / `firstTokenAt` 留着，新一次生成算出来的耗时是从上一次开始算的——这个 bug 很隐蔽，因为数字看着仍然「像个耗时」。用导出的小工具一把清干净：

```ts
import { resetStreamTiming } from 'zen-ai-chat-ui'

function onRetry(msg: ChatMessage) {
  msg.content = ''
  msg.reasoning = ''
  msg.error = undefined
  msg.status = 'streaming'
  resetStreamTiming(msg)   // 重置 createdAt / finishedAt / firstTokenAt / meta
  runStream(msg)
}
```

### 单独使用 `<MessageMeta>`

它只依赖消息对象，可以塞进自己的气泡组件里：

```vue
<MessageMeta :message="msg" :config="{ items: ['duration', 'tokens'] }" />
```

> `MessageMeta` 自身**不带**悬停隐藏逻辑（和 `MessageActions` 一样，那由父容器决定），独立使用时常显。上面说的「默认悬停」是 `MessageBubble` 配合 `visibility: 'hover'` 做出来的效果。

配套的格式化函数也导出了，方便你在别处复用同一套口径：`formatDuration(1234) === '1.2s'`、`formatTokens(12345) === '1.2万'`、`formatClock(Date.now()) === '14:32'`。

## 内置 AI 品牌头像

除了让用户自己填头像 URL，组件库还内置了 13 个知名 AI 产品的头像，零配置直接用。

![内置 AI 品牌头像](docs/avatars.png)

```vue
<script setup lang="ts">
import { ChatContainer, AI_AVATARS, resolveAvatar } from 'zen-ai-chat-ui'
</script>

<template>
  <!-- 1) 直接按键名取用（有类型提示，写错会报错） -->
  <ChatContainer :messages="messages" :assistant-avatar="AI_AVATARS.claude" />

  <!-- 2) 业务里存的是厂商字符串时，用 resolveAvatar 兜底 -->
  <ChatContainer :messages="messages" :assistant-avatar="resolveAvatar(model.provider)" />
</template>
```

`resolveAvatar` 的设计意图是**透传**：已知键名返回内置头像，未知值原样返回。所以你可以放心把「数据库里的厂商名 or 用户自填的 URL or emoji」直接丢给它，不用写 `if/else`。

### 可用键名

`claude` · `codex` · `kimi` · `opencode` · `zcode` · `openai` · `gemini` · `mistral` · `copilot` · `cursor` · `perplexity` · `ollama` · `huggingface`

对应的具名导出为 `avatarClaude`、`avatarCodex`…，也可以按需 tree-shaking 引入：

```ts
import { avatarClaude } from 'zen-ai-chat-ui'
```

### 渲染「选择头像」列表

`AI_AVATAR_PRESETS` 提供每个头像的元信息（`key` / `name` / `vendor` / `color` / `src`），适合直接 `v-for` 成头像选择器：

```vue
<script setup lang="ts">
import { AI_AVATAR_PRESETS } from 'zen-ai-chat-ui'

const emit = defineEmits<{ pick: [key: string] }>()
</script>

<template>
  <button
    v-for="p in AI_AVATAR_PRESETS"
    :key="p.key"
    :title="`${p.name} · ${p.vendor}`"
    @click="emit('pick', p.key)"
  >
    <img :src="p.src" :alt="p.name" width="32" height="32" />
  </button>
</template>
```

### 单条消息覆盖头像

`assistant-avatar` / `user-avatar` 是**全局**配置。如果某一条消息想单独换头像（比如一个会话里切换了模型、或者用户给自己起了不同形象），直接在该条消息上写 `avatar`：

```ts
messages.value.push({
  id: 'u1',
  role: 'user',
  content: '你好',
  avatar: 'https://example.com/me.png', // 这条消息专属，优先级高于 user-avatar
  status: 'done'
})
```

优先级为 **`message.avatar` > 全局 prop > 内置 svg 兜底**。`user` 与 `assistant` 两种角色都支持；想还原成「跟随全局」，把该字段删掉（或置为 `''`）即可。

### 说明

- 所有头像都会被规范化成 **64×64、白色圆底**的 SVG data URL，并以**几何平均边长**对齐视觉尺寸——宽扁的 Logo（如 Claude）不会被缩得比方形 Logo 小一圈。全部 13 个合计约 18.8 KB，已在包内，运行时零请求。
- 源 SVG 保留在 `src/avatars/svg/`，生成脚本是 `scripts/build-avatars.mjs`（`npm run build:avatars`）。**`src/avatars/index.ts` 是生成产物，请勿手改**。
- 许可：`simple-icons` 来源的部分为 CC0 1.0；其余为各厂商官方标识，版权归各自所有者，此处仅用于指代对应产品。详见 [`src/avatars/README.md`](src/avatars/README.md)。

## 追问建议

每轮 assistant 回复完成后，会在该条气泡下方独立区域展示一组「继续追问」按钮。宽度自适应内容，超过上限会单行省略。

### 基础用法（静态追问）

直接把数组传给 `followup`：

```vue
<ChatContainer
  :messages="messages"
  :followup="[
    { id: '1', label: '举个例子', prompt: '能举个例子吗？' },
    { id: '2', label: '深入讲讲原理', prompt: '详细讲讲它的原理' },
    { id: '3', label: '和其他方案对比', prompt: '和同类方案相比呢？' }
  ]"
/>
```

点击追问按钮会自动触发 `send` 事件（payload 为 `{ text: q.prompt, files: [] }`），等同于用户手动发送。

### 高级用法（动态生成）

传 `FollowupConfig` 对象，启用 `provider` 异步生成追问。每轮 assistant 完成时会自动调用：

```vue
<ChatContainer
  :messages="messages"
  :followup="{
    title: '你可能还想问',
    mode: 'latest',
    provider: async (lastMessage, history) => {
      const res = await fetch('/api/followup', {
        method: 'POST',
        body: JSON.stringify({ last: lastMessage, history })
      })
      return (await res.json()).questions
    }
  }"
  @followup-select="(q, source) => console.log('clicked', q, source)"
/>
```

### `FollowupConfig` 字段

| 字段                  | 类型                                              | 默认值            | 说明 |
| --------------------- | ------------------------------------------------- | ----------------- | ---- |
| `items`               | `PresetQuestion[]`                                | -                 | 静态追问列表；与 `provider` 同时传时优先用 items |
| `provider`            | `(last, history) => PresetQuestion[] \| Promise`  | -                 | 动态生成追问；返回 `Promise` 时会展示 loading 骨架 |
| `title`               | `string`                                          | `'继续追问'`      | 区段标题 |
| `mode`                | `'after-answer' \| 'latest'`                      | `'latest'`        | `'latest'` 只展示最后一条消息的追问；`'after-answer'` 每条完成的 assistant 都展示 |
| `showDuringStreaming` | `boolean`                                         | `false`           | 是否在 assistant 流式输出过程中就展示（默认等回复完成） |
| `autoSend`            | `boolean`                                         | `true`            | 点击追问是否自动作为用户消息发送；设为 `false` 则只触发 `followup-select` 事件 |

### 单独使用 `<FollowupSuggestions>`

如果想完全自定义位置 / 嵌入其他场景，直接用组件：

```vue
<FollowupSuggestions
  :items="[{ id: '1', label: '再讲讲', prompt: '再讲讲' }]"
  title="你可能还想问"
  @select="onPick"
/>
```

## 主题定制

覆盖任意 CSS 变量即可换肤，变量定义于 `:root`，切换深色用 `[data-theme="dark"]`：

```css
:root {
  --acu-primary: #10b981;       /* 主色 */
  --acu-bubble-user-bg: #10b981;/* 用户气泡背景 */
  --acu-bubble-user-text: #fff; /* 用户气泡文字（改成实色底时记得同步） */
  --acu-radius: 14px;           /* 圆角 */
}
```

组件只消费令牌、不写死色值，所以下面这些「几何/节奏」类令牌也都能改：

| 令牌 | 默认 | 作用 |
| --- | --- | --- |
| `--acu-max-width` | `min(100%, 920px)` | 内容列（开场白 / 消息列表 / 输入框）宽度上限；组件内传入的 `maxWidth` 会覆盖它 |
| `--acu-bubble-max-width` | `min(680px, 78%)` | 气泡与追问卡的最大宽度（同一列，改一处两处对齐） |
| `--acu-bubble-assistant-bg` | `transparent` | assistant 回答的底色。默认**没有气泡**，回答直接落在页面底色上 |
| `--acu-bubble-assistant-border` | `transparent` | assistant 气泡的内描边（用 inset 阴影实现，不占布局） |
| `--acu-turn-gap` | `16px` | 相邻两轮问答之间的间距 |
| `--acu-card-bg` / `-border` / `-border-hover` | `#ffffff` / `#dfe0e9` / `#c3c5d4` | 预设问题等可点选卡片的底与描边（深色下为 `#1e1e25` / `#2f2f39` / `#454554`） |
| `--acu-space-0-5` `-1-5` `-2-5` `-3-5` | `2px` `6px` `10px` `14px` | 半步间距刻度 |
| `--acu-font-size-2xs` / `-2xl` / `-3xl` | `11px` / `22px` / `26px` | 元信息等小字 / 章节标题 / 开场白主标题 |
| `--acu-radius-md` | `14px` | 圆角阶梯里 12 → 18 之间的一档（开场白徽标、预设卡片） |
| `--acu-line-height-heading` | `1.25` | 标题行高。**标题不要继承正文的 `--acu-line-height`(1.65)**，否则单行标题会撑出 36px 的行盒 |
| `--acu-line-height-tight` / `-relaxed` | `1.5` / `1.7` | 单行控件 / 长文（思考、代码） |
| `--acu-overlay-*` | 深色系 | 图片灯箱配色（定义在裸 `:root`，不随主题变化） |

> `--acu-bubble-assistant-border` 用的是 `inset` 阴影而不是 `border`：加 `border` 会把气泡撑大 2px、整列跟着抖一下，inset 阴影贴着圆角画在里面，零布局影响。

### 把 assistant 气泡「加回来」

默认样式里回答侧没有气泡（Claude / ChatGPT 的做法：靠留白、排版和字号层级分块），
user 侧是淡主色气泡。想要两边都有实体气泡的老样式，覆盖三个令牌即可，不用改组件：

```css
:root {
  --acu-bubble-assistant-bg: var(--acu-surface);
  --acu-bubble-assistant-border: var(--acu-border); /* 浅色下没有描边气泡会看不见 */
  --acu-bubble-user-bg: var(--acu-primary);         /* 用户气泡回到实心主色 */
  --acu-bubble-user-text: var(--acu-primary-contrast);
}
```

## 本地开发

```bash
npm install
npm run dev      # 启动调试（http://127.0.0.1:7788）
npm run build    # 构建组件库产物（dist/）
npm run release  # 一键发版（见下）
```

### 演示页的「全部配置」面板

`npm run dev` 打开的演示页顶栏有一个 **全部配置** 按钮（按钮上直接显示当前项数，如「全部配置（50 项）」），
展开后按 prop 分组列出组件库对外暴露的**每一个可配置项**——改一下立刻能看到对话区的变化，不用去翻文档。

![全部配置面板](docs/config-panel.png)

面板由 `dev/App.vue` 里的一份 `SCHEMA` 驱动：每个字段声明 `{ key, label, field, type, options, hint }`
就能自动渲染出对应控件（开关 / 下拉 / 数字 / 文本 / 多选），条目计数和「重置配置」也会自动跟上。
新增一个配置项时只需往 `SCHEMA` 补一行，不会再出现「文档里有、演示里没有」。

演示页本身不再卡宽度（撑满视口），所以在宽屏上就能直接看到内容列被 `--acu-max-width` 截断居中的效果。
「内容列最大宽度」这一项留空即走组件默认值；想对比「铺满」和「截断」，填 `100%` 即可，也支持 `?maxWidth=900` 这样的 URL 参数初始化。

## 发布

```bash
npm run release -- --dry-run   # 先看一遍计划，不写文件 / 不提交 / 不发布
npm run release                # 正式发版
```

脚本（`scripts/release.js`）按顺序做 8 件事：

1. **环境检查** —— git 仓库 / 分支 / 清理遗留 `*.lock` / 工作区干净 / `npm whoami` 已登录
2. **更新版本号** —— 同步写 `package.json` 与 `package-lock.json`
3. **构建** —— `npm run build`（含 `vue-tsc` 类型检查）
4. **发布物自检** —— 见下
5. **版本占用检查** —— registry 上已存在同名版本则中止
6. **提交并打 tag** —— 只 stage `package.json` / `package-lock.json`，然后 `git push` + `git push --tags`
7. **发布** —— `npm publish --tag <dist-tag>`
8. **发布后校验** —— 轮询 registry 直到该版本可见，并检查 dist-tags 没被污染

### 常用参数

| 参数 | 说明 |
| --- | --- |
| `--dry-run` | 只打印计划。**构建与 `npm pack` 仍会真跑**，因为发布物自检必须基于真实产物 |
| `--skip-push` | 提交但不 push |
| `--skip-publish` | 只到提交为止，不发 npm |
| `--skip-build` | 跳过构建（自检会基于旧 `dist`，慎用） |
| `--yes` / `-y` | 所有询问取默认答案 |
| `--version=0.1.0` | 指定版本号；不传则自动递增（`0.1.0-beta.7` → `0.1.0-beta.8`）。**从预发布转正式版必须显式指定** |
| `--tag=next` | 覆盖 npm dist-tag |

### dist-tag 是自动的，这点很重要

`0.1.0-beta.8` 这类带预发布标识的版本会自动发到 `beta` 标签，而不是 `latest`。

npm 本身**不会**替你避开 `latest`——不加 `--tag` 就会把 beta 顶成 `latest`，让所有 `npm i zen-ai-chat-ui` 的消费方装到 beta 版。脚本会强制带上 `--tag`，并在第 8 步复查 `latest` 有没有被预发布版本污染。

### 发布物自检（第 4 步）为什么必须存在

`package.json#files` 是逐条列举的白名单，缺文件的问题**在本地永远复现不了**（本地有全部文件），只有把真实 tarball 清单拉出来比对才发现得了。脚本用三道互相独立的网卡住：

| 检查 | 拦住的问题 |
| --- | --- |
| ① `dist/` 关键工件存在 | `vite.config.ts` 的 `lib.fileName` / `assetFileNames` 被改动导致产物改名（消费方 `import 'zen-ai-chat-ui/style.css'` 会直接 404） |
| ② 真实 `npm pack --dry-run` 清单 | `files` 白名单里的东西被 `.npmignore` / `.gitignore` 反手排除 |
| ③ `main` / `module` / `types` / `exports` 指向的文件确实在包里 | 改了目录结构却漏改 `exports`，消费方 import 时模块解析失败 |

任一失败都会中止发布，不会产生"发出去才发现装不上"的包。

## License

MIT
