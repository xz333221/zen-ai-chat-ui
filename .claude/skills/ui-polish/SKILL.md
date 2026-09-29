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
纯样式轮次也不要动 props。

DOM 结构默认也不动（消费方可能拿内部 class 写过覆盖样式）。**唯一允许的例外**：
某个视觉原语非有标记不可、且纯 CSS 做不到时，可以加**纯装饰**节点，
但要满足三条 —— `aria-hidden="true"`、不改任何既有元素的语义与 class、
在 commit message 里写明。已发生的先例：预设卡片加了序号列
`<span class="acu-preset-q-index" aria-hidden="true">`（把「一排按钮」变成「一页目录」，
是那轮唯一带记忆点的设计选择）。

## 视觉语言（2026-09-29 定稿）

用户明确选了「克制留白派」（Claude / ChatGPT 那一档），不是卡片+渐变派，也不是紧凑 IDE 派。

| 维度 | 约定 | 理由 |
| --- | --- | --- |
| assistant 回答 | **不套气泡**：`--acu-bubble-assistant-bg: transparent`，`padding: 6px 0`，左右内边距为 0 | 回答直接落在页面底色上，靠留白与排版分块。加回气泡会让整屏回到「聊天挂件」观感 |
| user 提问 | 淡主色底 `#eceefe` + 深主色字 `#312e81` | 主色退回「强调」角色（占比 ≤10%），不再每条提问刷一整块饱和主色 |
| 中性色 | 全部往品牌蓝紫偏 ~0.008 chroma（`#fcfcfd` / `#f7f8fa` / `#e8e9ef`） | 纯 zinc 灰大面积铺开像「没调过」 |
| 阴影 | 每档两层（近处收紧 + 远处扩散） | 单层同色硬边阴影是「廉价」最明显的信号 |
| 缓动 | `--acu-easing` 一次性过渡用 easeOutQuint `cubic-bezier(0.22,1,0.36,1)`；**循环脉冲动画必须单独写 `ease-in-out`** | 「快进慢出」曲线套在 0%→50%→100% 往返关键帧上会变成一跳一停的抽搐 |
| 圆角 | xs 4 / sm 8 / 12 / **md 14** / lg 18 / xl 20 / full | 容器 18px 里塞 8px 圆角方块会形成两套圆角语言，控件统一用 `full` 或 `sm`。`md 14` 是 2026-09-29 补的一档：12 → 18 之间原来是空的，开场白徽标 / 预设卡片这种「比默认再圆一点、又不到 lg」只能二选一硬凑 |
| 对比度 | 11-12px 的 muted 文字必须 ≥ 4.5:1（浅色 `#74747e`、深色 `#93939f`） | 原来的 `#a1a1aa` 只有 2.6:1，小字糊成灰雾且不过 WCAG AA |
| 轮次节奏 | `--acu-turn-gap: 16px` | assistant 侧「操作栏 + 元信息」行即使 hover 隐藏也占 ~34px，已经在撑轮间距；gap 再大就散 |
| 排版 | `p`/`li` 用 `text-wrap: pretty`，标题用 `text-wrap: balance`；正文列宽 680px | 抑制中文孤字、标题末行两个字 |
| 标题行高 | **标题不继承 `--acu-line-height`(1.65)**，用 `--acu-line-height-heading`(1.25) | 26px 标题配 1.65 会撑出 43px 行盒，标题「飘」在句子里、和下方描述凑不成一组 |
| 可点选卡片 | 底用 `--acu-card-bg`（浅色白底）+ 描边 `--acu-card-border`，**不用 `--acu-surface` 灰底**；悬停只做「描边加深 + `--acu-shadow-sm` + 抬 1px」，**不整块刷 `--acu-primary-soft`** | 灰底铺在近白页面上读成「被禁用的表单域」，九张并排糊成灰格子。悬停整块变色是页面里最吵的动作，克制路数里位移和颜色都该留给焦点本身 |
| 网格 | `repeat(auto-fit, minmax(280px, 1fr))`，不写固定列数 + 媒体查询 | 920px 下自动 3 列。**固定列数会把「列数」和「断点」绑死**，且 9 条在 2 列下必剩孤格。⚠️ 原来那条 `:last-child:nth-child(odd) { grid-column: 1 / -1 }` 孤格补丁**已删除**：9 既是奇数又是 3 的倍数，它在 3 列下会把第 9 张拉成全宽、反而破坏 3×3 方阵。换 `auto-fit` 后孤格交给网格自己处理，别再把它加回来 |
| 表格 | 只留横向分隔线 + 表头淡底，**不要**斑马纹、不要整格网格 | 网格 + 斑马纹是三重编码同一件事 |

### 布局：内容列与 gutter（2026-09-29 修过的真 bug）

**「内容列」= `--acu-max-width` 本身**（默认 `min(100%, 920px)`）。开场白 / 消息列表 /
输入框是同一列，三者的**可视左右边缘必须完全重合**。

实现上，左右 gutter 必须打在**外层**容器（`.acu-welcome` / `.acu-message-list` /
`.acu-chat-footer`）上，**绝不能打在内层 `-inner` 上**：

```scss
/* ❌ 内层带 padding → 内容列实际只有 max-width - 32，输入框却是完整 max-width */
.acu-welcome-inner { max-width: var(--acu-max-width); padding: 0 16px; }

/* ✅ gutter 在外层，inner 就是 max-width 本身 */
.acu-welcome { padding: 32px 16px; }
.acu-welcome-inner { max-width: var(--acu-max-width); }
```

踩过的症状：预设卡片列 `406→1294`，输入框框线 `390→1310` —— 每侧差 16px，
肉眼一眼能看出错位。注意宽容器下给滚动容器加**对称** padding 不会移动居中盒
（`max-width` 生效时），窄容器下 `100% - 32px` 也仍然保留边距，两边都对。

**改 gutter 位置前先看 `MessageRail`**：它的
`left: max(6px, calc(50% - var(--acu-max-width,100%) / 2 - 40px))` 假定
「内容列左边缘 = 50% − max-width/2」。给滚动容器加对称 padding 不破坏这个前提；
改 inner 的 max-width（比如 +32px 去补偿 padding）会把侧边条推歪 16px。

验证口径（一条断言搞定）：任意视口宽度下
`listInner.offsetWidth === gridInner.offsetWidth === composer.offsetWidth`。
用 `offsetWidth` 而不是 `getBoundingClientRect()` —— 后者带 `transform`。

### 网格里卡片行高必须一致

预设卡片按内容自然撑高时，实测 9 张出现 `[78×6, 96×3]`：
前两行 78px，第三行被一张两行文案撑到 96px。同一网格里行高参差比「卡片矮一点」难看得多。

修法是把那段空气**固定在文本块内部**，而不是给卡片写死 `min-height`：

```scss
.acu-preset-q-prompt {
  @include acu-ellipsis(2);
  min-height: calc(var(--acu-font-size-xs) * var(--acu-line-height-tight) * 2);
}
```

卡片写死高度在文案更长时会失效；跟着字号令牌走的下限，改字号自动跟随。

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

> **Playwright 不是唯一路径。** 若 playwright 不可用（或不想为了截一张图去装 500MB 浏览器），
> 用 **CDP + 本机已有的 `chrome-headless-shell`** 同样能截图、量几何、触发真实 hover：
> 见 `~/.workbuddy/skills/cdp-headless-ui-verify/`，其中
> `scripts/cdp-zoom.mjs` 是配套的「按选择器放大截图」工具 —— 全页截图缩到 1080 宽后，
> **11px 字号、1px 描边、箭头差 1px 的对齐全都看不出来**，必须放大看；
> 它顺手打印的 `offsetHeight` 数组正好用来查上面那条「卡片行高参差」。
> 2026-09-29 那轮样式精修全程走的就是 CDP，没装 playwright。

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

### 交互态改动必须做「反证」

改了 hover / active / focus 这类状态样式后，**断言全绿说明不了任何事** ——
断言可能本来就是恒真的（选择器恒命中、前置条件恒满足、`hover` 根本没触发）。

可靠做法：**把修复临时撤回去再跑一次，期望关键断言变红**，然后改回来再跑，确认恢复全绿。

```bash
# 1) 修复态 → 跑，期望全绿
# 2) 把选择器改回旧写法 → 跑，期望「那条」断言变红、其余不受影响
# 3) 改回 → 再跑一次，确认恢复
```

2026-09-29 实测（侧栏选中行被 hover 底色盖掉）：修复后 **6/6**、撤掉后 **5/6**，
红的那条正好是被测项，其余 5 条一条没动 —— 这才证明断言在测你改的那件事。
成本是「改一行 + 重跑一次」，几乎没有理由跳过。

> ⚠️ `:hover` 不能被 JS 伪造。要在无头浏览器里验 hover，必须发**真实鼠标事件**
> （`Input.dispatchMouseEvent` 的 `mouseMoved`），并且先 `matches(':hover')` 确认
> 鼠标真的落在目标上，再读 `getComputedStyle`。只改 class 断言等于没测。
> 另外注意 `opacity: 0` **不参与命中测试**（只有 `visibility: hidden` /
> `pointer-events: none` / `display: none` 会），所以「隐藏的 hover 操作按钮」
> 在真人手里没问题、在脚本里却点不中 —— 别为了让脚本过而去改产品代码。

## 收尾

样式轮次**不触发** README 的功能章节更新，但**令牌默认值变了必须同步**
`README.md` 的「主题定制」令牌表，否则文档里写的默认值就是错的。
`docs/*.png` 里的旧截图会过期，换了气泡样式要提醒用户重新生成，不要假装还准。
