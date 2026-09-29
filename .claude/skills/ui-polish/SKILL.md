---
name: ui-polish
description: zen-ai-chat-ui 专属视觉规范 skill。改这个组件库任何样式（.scss / .vue 的 <style>）之前必读：约定「产品级克制留白」的视觉语言（回答侧无气泡、主色占比、中性色偏色、双层阴影、缓动分工、圆角阶梯、Markdown 排版），并给出改完必须跑的验证清单（build + Playwright 截图 + 对比度 + 深浅色对齐）与已知踩坑。适用触发词：样式、美化、不够精美、UI 优化、换肤、配色、间距、圆角、动效、token。
---

# zen-ai-chat-ui 视觉规范与验证流程

## 定位

`register = product`：这是给别人用的**组件库**（app UI 场景），不是营销页。
设计服务于任务，判断标准是「用过 Linear / Claude / ChatGPT 的人会不会觉得哪一处微妙地不对」，
不是「够不够炸」。

**最高约束：`--acu-*` 令牌是公开契约。** 只能改默认值、只能新增，
**禁止改名 / 删除**（README 承诺了消费方可覆盖任意令牌换肤）。
纯样式轮次也不要动组件 DOM 结构与 props。

## 视觉语言（2026-09-29 定稿）

用户明确选了「克制留白派」（Claude / ChatGPT 那一档），不是卡片+渐变派，也不是紧凑 IDE 派。

| 维度 | 约定 | 理由 |
| --- | --- | --- |
| assistant 回答 | **不套气泡**：`--acu-bubble-assistant-bg: transparent`，`padding: 6px 0`，左右内边距为 0 | 回答直接落在页面底色上，靠留白与排版分块。加回气泡会让整屏回到「聊天挂件」观感 |
| user 提问 | 淡主色底 `#eceefe` + 深主色字 `#312e81` | 主色退回「强调」角色（占比 ≤10%），不再每条提问刷一整块饱和主色 |
| 中性色 | 全部往品牌蓝紫偏 ~0.008 chroma（`#fcfcfd` / `#f7f8fa` / `#e8e9ef`） | 纯 zinc 灰大面积铺开像「没调过」 |
| 阴影 | 每档两层（近处收紧 + 远处扩散） | 单层同色硬边阴影是「廉价」最明显的信号 |
| 缓动 | `--acu-easing` 一次性过渡用 easeOutQuint `cubic-bezier(0.22,1,0.36,1)`；**循环脉冲动画必须单独写 `ease-in-out`** | 「快进慢出」曲线套在 0%→50%→100% 往返关键帧上会变成一跳一停的抽搐 |
| 圆角 | xs 4 / sm 8 / 12 / lg 18 / xl 20 / full | 容器 18px 里塞 8px 圆角方块会形成两套圆角语言，控件统一用 `full` 或 `sm` |
| 对比度 | 11-12px 的 muted 文字必须 ≥ 4.5:1（浅色 `#74747e`、深色 `#93939f`） | 原来的 `#a1a1aa` 只有 2.6:1，小字糊成灰雾且不过 WCAG AA |
| 轮次节奏 | `--acu-turn-gap: 16px` | assistant 侧「操作栏 + 元信息」行即使 hover 隐藏也占 ~34px，已经在撑轮间距；gap 再大就散 |
| 排版 | `p`/`li` 用 `text-wrap: pretty`，标题用 `text-wrap: balance`；正文列宽 680px | 抑制中文孤字、标题末行两个字 |
| 表格 | 只留横向分隔线 + 表头淡底，**不要**斑马纹、不要整格网格 | 网格 + 斑马纹是三重编码同一件事 |

### 硬性禁止（踩过就知道）

- **粗色条左边框**（`border-left: 3px` 之类的引述/告警样式）—— 引用块用整块淡底 + 四角同圆角
- **虚线边框**当语义载体 —— 读起来像「未完成的占位」，用实线 + chevron/底色表达状态
- **渐变文字**、装饰性渐变块（开场白 logo 原来那个 primary-soft → surface 渐变就是反例）
- **`display: block` 加在 `<table>` 上**换横向滚动 —— Blink 会把内部表格网格降级成
  shrink-to-fit，表格只占内容列一半宽、与上下段落左边缘对不齐。
  正确做法：`display: table; width: 100%` + 单元格 `overflow-wrap: anywhere`
  （`anywhere` 参与 min-content 计算，超宽表也压得进内容列）
- **`--acu-easing` 用在 `infinite` 循环动画上**（见上表）

## 验证清单（改完必跑，别跳）

```bash
cd C:/workspace/github_workspace/zen-ai-chat-ui
npm run build          # vue-tsc --noEmit + SCSS 编译，两边都过才算过
```

纯样式改动**不需要** i18n 检查（模板里没新增中文字符串，注释不算）。

视觉验证用 Playwright 截图，能真看到东西才算验完：

```bash
cd C:/workspace/github_workspace/zen-ai-chat-ui && npm run dev > /tmp/vite.log 2>&1 &
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:7788/   # 必须 200
```

> ⚠️ 起 dev server **不要**接 `| head`。管道被 head 关掉后 vite 会收到 SIGPIPE 直接退出，
> 表现为「刚才 curl 还是 200，下一分钟就 connection refused」。
> 判断 vite 真活着：`curl -s http://127.0.0.1:7788/ | grep @vite/client` 必须命中。

截图脚本模板（playwright 只装在兄弟项目 `flow-mindmap` 里，
所以用 `createRequire` 从那个目录解析，脚本本身可以放在系统临时目录）：

```js
import { createRequire } from 'node:module'
const require = createRequire('file:///C:/workspace/github_workspace/flow-mindmap/')
const { chromium } = require('playwright')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1340, height: 900 }, deviceScaleFactor: 2 })
await page.goto('http://127.0.0.1:7788/', { waitUntil: 'load' })
```

### 演示页的导航方式（不看代码猜就会卡住）

- `dev/App.vue` 的 `messages` **初始是空的** —— 打开就是开场白页，没有气泡可看
- 开场白上的预设问题就是入口，按文字点：
  - `多轮对话（侧边条）` → `seedMultiTurnDemo()`，一次铺 6 轮问答，看气泡 / 节奏最方便
  - `展示 Markdown 渲染` → 看代码块 / 表格 / 引用 / 标题层级
  - `多工具调用折叠`、`超长思考滚动` → 工具调用组、思考块
- **一点预设问题，开场白就没了**。想跑下一个 demo，必须先点顶栏 `清空对话` 回到开场白，
  否则 `getByText('展示 Markdown 渲染')` 会 30 秒超时
- 主题按钮文字是 `主题：浅色`，点它循环 light → dark → auto；
  脚本里用「读 `[data-theme]` 属性、不是 dark 就再点一次」的循环，别数点击次数

### 两个必踩的坑

1. **流式期间 `elementHandle.screenshot()` 会报 `Element is not attached to the DOM`** ——
   markdown DOM 每来一个 chunk 就重建一次。等流式结束再截：
   ```js
   await page.waitForFunction(() => document.querySelectorAll('.acu-md table').length > 0)
   await page.waitForFunction(() => !document.querySelector('.acu-cursor'))  // 光标消失 = 流完了
   ```
2. **别对脚本自己所在的目录 `fs.rmSync(OUT, { recursive: true })`** —— 脚本会把自己删掉，
   虽然当次还能跑完（node 已把源码读进内存），但下次改它就 "File does not exist"。
   清旧图只删 `*.png`。

### 截图之外还要核数值

视觉靠看，**令牌有没有真的落到 DOM 上靠 `getComputedStyle`**。至少核这几个：

```js
const cs = getComputedStyle(document.querySelector('.acu-bubble.is-assistant'))
cs.backgroundColor   // rgba(0, 0, 0, 0) —— 不是 transparent 就说明令牌没生效
```

另外两件必查：

- **深浅色都要看**。所有改动的令牌在 `[data-theme='dark']` 块里必须有对应值，
  且深色下 muted 要比 secondary **更亮**（深底上「更亮 = 更次要」）
- **改对比度的令牌要手算一遍**。`#74747e` 对 `#fcfcfd` ≈ 4.53:1，`#93939f` 对 `#17171c` ≈ 5.8:1，
  刚好过 AA；再调浅一点就掉下去了

## 收尾

样式轮次**不触发** README 的功能章节更新，但**令牌默认值变了必须同步**
`README.md` 的「主题定制」令牌表，否则文档里写的默认值就是错的。
`docs/*.png` 里的旧截图会过期，换了气泡样式要提醒用户重新生成，不要假装还准。
