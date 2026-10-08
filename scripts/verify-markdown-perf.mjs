// Copyright 2026 xzisme
//
// Markdown 渲染管线探针（npm run verify:markdown）
//
// 为什么要有它：代码高亮是整条渲染管线唯一的重量级操作，而正文是"每长一个字就整篇重来"
// 的。没有这层保护时，一次 12KB 的流式回答实测要烧 6.4s 主线程（单次全量渲染 214ms，
// 其中 99.7% 是 shiki —— 同样的正文把高亮关掉只要 0.7ms），界面上就是「打字一卡一卡」。
// 这里钉住两件事：
//   1. **契约**：正在写、还没闭合的那个尾随代码块不高亮；已闭合的照常高亮；
//      文档中间的围栏不受影响；正文与 mermaid 契约逐字不变；流结束后补一次全量渲染，
//      拿到的 HTML 与非流式渲染**完全一致**（这条是"用户最终看到的没变"的保证）
//   2. **成本**：同一篇文档第二次渲染必须显著变快（缓存生效）
//
// 依赖：先 npm run build
// 用法：node scripts/verify-markdown-perf.mjs [--reverse]
//   --reverse：把优化注回去（流式渲染不再跳过未闭合围栏、也不复用缓存），
//   契约断言与成本断言都必须翻红 —— 全绿说明探针量错了对象。
// 退出码：0 全通过，1 有失败项。

import { useMarkdown, ensureHighlighter } from '../dist/ai-chat-ui.es.js'

const REVERSE = process.argv.includes('--reverse')

let fail = 0
/**
 * `stream: true` 表示这一条量的是本次优化本身 —— 反向模式（把优化注回去）下期望它翻红。
 */
function check(label, ok, extra = '', stream = false) {
  const expectRed = REVERSE && stream
  const good = expectRed ? !ok : ok
  console.log(
    `${good ? '  ok  ' : '  !!  '} ${label}${extra ? `  ${extra}` : ''}${expectRed ? '  [反向：期望翻红]' : ''}`
  )
  if (!good) fail++
}

await ensureHighlighter()
const { render } = useMarkdown()

/** 反向模式 = 把优化注回去：一律走非流式那条路 */
const opts = (streaming) => (REVERSE ? {} : streaming ? { streaming: true } : {})

// —— 夹具：每次跑换一个随机串，保证高亮缓存是冷的（否则成本断言会被上一轮的缓存喂饱）
const nonce = Math.random().toString(36).slice(2, 8)
const codeBlock = (i, lang = 'ts', tag = nonce) =>
  '```' + lang + '\n' +
  Array.from({ length: 25 }, (_, n) => `const v_${tag}_${i}_${n} = compute(${n}) // 第 ${n} 行`).join('\n') +
  '\n```\n'
const prose = (i) => `## 第 ${i} 节\n\n这一段是正文，用来把代码块隔开，让围栏判定必须看行号而不是"有没有围栏符号"。\n\n`

const HEAD = prose(1) + codeBlock(1) + '\n' + prose(2) + codeBlock(2, 'js') + '\n'
const MID = prose(3) + codeBlock(3) + '\n'
/** 还在写：开了围栏但没有闭合标记 */
const OPEN_TAIL = '```python\n' + Array.from({ length: 20 }, (_, n) => `v_${nonce}_open_${n} = compute(${n})`).join('\n')
/** 写完：同一段补上闭合标记 + 一点后续正文 */
const CLOSED_TAIL = OPEN_TAIL + '\n```\n\n' + prose(4)

const streamingDoc = HEAD + MID + OPEN_TAIL
const doneDoc = HEAD + MID + CLOSED_TAIL

// —— 1. 契约：未闭合的尾随围栏不高亮，源码原样可见 ——
const streamingHtml = render(streamingDoc, opts(true))
const tailStart = streamingHtml.lastIndexOf('acu-code-block')
const tailHtml = streamingHtml.slice(tailStart)
check(
  '流式：未闭合的尾随代码块按纯文本渲染（没有 shiki）',
  tailHtml.includes('acu-code-fallback') && !tailHtml.includes('shiki-themes'),
  '',
  true
)
check(
  '流式：未闭合块的源码原样可取（转义过、没漏标签）',
  tailHtml.includes(`v_${nonce}_open_0 = compute(0)`) && !/<script/i.test(tailHtml),
  '',
  true
)

// —— 2. 契约：已闭合的代码块照常高亮 ——
// 高亮版 <pre class="shiki shiki-themes github-light github-dark">，降级版是
// <pre class="shiki acu-code-fallback"> —— 用 shiki-themes 区分，别用 class="shiki"
const closedCount = (html) => (html.match(/shiki-themes/g) || []).length
check('流式：前面已闭合的代码块仍然高亮', closedCount(streamingHtml) === 3, `高亮块 ${closedCount(streamingHtml)}/3`, true)
const firstBlock = streamingHtml.slice(0, streamingHtml.indexOf('acu-code-block', streamingHtml.indexOf('acu-code-block') + 1))
check('流式：闭合块带双主题变量（浅/深色都能换）', firstBlock.includes('--shiki-light') && firstBlock.includes('--shiki-dark'))
check('流式：闭合块带语言标签与复制按钮', firstBlock.includes('acu-code-lang') && firstBlock.includes('acu-code-copy'))

// —— 3. 契约：文档中间的围栏不受影响（防止"末尾判定"写成"全都跳过"） ——
const midSlice = streamingHtml.slice(streamingHtml.indexOf('第 3 节'))
check('流式：中间那段闭合围栏没被误判成"正在写"', closedCount(midSlice) === 1, '', true)

// —— 4. 契约：流结束补一次全量渲染 = 非流式渲染，逐字一致 ——
const doneStreaming = render(doneDoc, opts(true))
const donePlain = render(doneDoc, opts(false))
const both = REVERSE ? donePlain : doneStreaming
check('流式最后一帧补高亮后 = 非流式渲染（用户最终看到的没变）', both === donePlain)
check('流结束后所有代码块都高亮', closedCount(donePlain) === 4, `高亮块 ${closedCount(donePlain)}/4`)

// —— 5. 契约：没有代码块的正文，流式与非流式逐字相同 ——
const pureProse = prose(1) + prose(2) + '| a | b |\n| - | - |\n| 1 | 2 |\n\n<think>内部推理</think>\n'
check('无代码块的正文流式渲染逐字不变', render(pureProse, opts(true)) === render(pureProse, opts(false)))

// —— 6. 契约：mermaid 占位块照旧 ——
const mMd = '```mermaid\ngraph TD\n  A --> B\n'
check('流式：未闭合的 mermaid 仍是占位块（没被当成普通代码块）', render(mMd, opts(true)).includes('class="acu-mermaid"'))

// —— 7. 成本：同一篇文档第二次渲染必须显著变快（高亮缓存生效）——
// 反向模式换一份内容再渲染 = 缓存必然 miss，比值会回到 ~1，这条因此翻红
const cold = MID + prose(4) + codeBlock(4) + '\n' + prose(5) + codeBlock(5)
const t0 = performance.now()
render(cold, opts(false))
const t1 = performance.now() - t0
const again = REVERSE ? cold.replaceAll(`v_${nonce}_`, `z_${nonce}_`) : cold
const t2s = performance.now()
render(again, opts(false))
const t2 = performance.now() - t2s
check(
  '同一篇文档第二次渲染走缓存（< 首次 50%）',
  t2 < t1 * 0.5,
  `首次 ${t1.toFixed(1)}ms → 再次 ${t2.toFixed(1)}ms`,
  true
)

// —— 8. 成本：模拟"流式每一帧" —— 文档每帧往下长，只有最后那个围栏在变 ——
// 两边的差别只剩"要不要高亮正在写的那个块"：闭合块的缓存对两边一视同仁，
// 所以比值量的就是这一件事。反向模式下两边都高亮 → 比值回到 ~1 → 翻红。
const FRAMES = 20
const tailLine = (n) => `v_${nonce}_grow_${n} = compute(${n})`
const loopDoc = (lines) => HEAD + MID + '```python\n' + Array.from({ length: lines }, (_, n) => tailLine(n)).join('\n')

const s0 = performance.now()
for (let f = 1; f <= FRAMES; f++) render(loopDoc(f * 3), opts(true))
const streamMs = performance.now() - s0

const b0 = performance.now()
for (let f = 1; f <= FRAMES; f++) render(loopDoc(f * 3), opts(false))
const fullMs = performance.now() - b0

check(
  `流式 ${FRAMES} 帧的总开销 < 每帧全量重渲染的 50%`,
  streamMs < fullMs * 0.5,
  `流式 ${streamMs.toFixed(1)}ms vs 全量 ${fullMs.toFixed(1)}ms`,
  true
)

console.log(
  REVERSE
    ? `\n反向验证：${fail === 0 ? '✔ 该红的都红了（优化确实在被量）' : `✘ 还有 ${fail} 条没红 —— 探针量错了对象`}`
    : `\n${fail === 0 ? '✔ 全部通过' : `✘ ${fail} 条失败`}`
)
process.exit(fail === 0 ? 0 : 1)
