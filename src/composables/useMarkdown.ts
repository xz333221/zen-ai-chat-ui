// ============================================================
// ai-chat-ui · Markdown 渲染（markdown-it + Shiki 双主题高亮）
// 模块级单例：highlighter 异步预加载，未就绪时降级为纯文本代码块，
// 就绪后通过 isReady 触发组件重新渲染。
// ============================================================
import { ref, type Ref } from 'vue'
import MarkdownIt from 'markdown-it'
import { createHighlighter, type Highlighter } from 'shiki'
import { isMermaidEnabled, isMermaidLang, mermaidLabels, mermaidTypeLabel } from './useMermaid'

// 预加载常用语言（按需可扩展）
const PRELOAD_LANGS = [
  'javascript',
  'typescript',
  'python',
  'bash',
  'shell',
  'json',
  'html',
  'css',
  'vue',
  'markdown',
  'sql',
  'go',
  'rust',
  'java',
  'cpp',
  'c',
  'yaml',
  'jsx',
  'tsx',
  'xml'
]

let highlighter: Highlighter | null = null
let highlighterPromise: Promise<Highlighter> | null = null

/** highlighter 是否就绪（组件 watch 后可重新渲染） */
export const isShikiReady: Ref<boolean> = ref(false)

export function ensureHighlighter(): Promise<Highlighter> {
  if (highlighter) return Promise.resolve(highlighter)
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: PRELOAD_LANGS
    })
      .then((h) => {
        highlighter = h
        isShikiReady.value = true
        return h
      })
      .catch((err) => {
        console.warn('[ai-chat-ui] Shiki 加载失败，代码块将降级为纯文本:', err)
        return null as unknown as Highlighter
      })
  }
  return highlighterPromise
}

// 启动预加载（非阻塞）
ensureHighlighter()

/**
 * Shiki 结果的缓存：`lang\0code` → 高亮 HTML。
 *
 * 为什么要它：`codeToHtml` 是整条渲染管线里唯一的重量级操作 —— 实测一段 12KB 的
 * 答案（8 个 25 行代码块）单次渲染 214ms，其中 **99.7% 是 shiki**（同样的正文去掉
 * 高亮只要 0.7ms，纯正文 0.2ms）。而渲染是"整篇重来"的：正文每长一个字就重新解析、
 * 重新高亮**每一个**代码块。没有缓存时，一次流式输出（12KB）总共要烧 6.4s 主线程，
 * 界面上就是「一卡一卡」。
 *
 * 已闭合的代码块内容不会再变，所以缓存命中率极高：正文增长时只有"最后一个还在写的
 * 代码块"会 miss（它由下面的 streaming 分支直接跳过，见 `render` 的 options）。
 *
 * 缓存与主题无关：高亮走的是双主题 CSS 变量（`defaultColor: false`），
 * 换主题只换变量，HTML 不变，所以不需要按主题分键。
 */
const HIGHLIGHT_CACHE_MAX = 300
const highlightCache = new Map<string, string>()

/** 高亮一段代码；命中缓存直接返回。失败（未知语言）返回空串，由调用方降级为纯文本 */
function highlightCode(code: string, lang: string): string {
  if (!highlighter || !lang) return ''
  const key = `${lang}\u0000${code}`
  const cached = highlightCache.get(key)
  if (cached !== undefined) return cached

  let html = ''
  try {
    html = highlighter.codeToHtml(code, {
      lang,
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false
    })
  } catch {
    return '' // 未知语言，不进缓存（每次都会抛，缓存它没意义）
  }

  // 超上限时整批淘汰最旧的四分之一：Map 保插入序，一次删一批比每次删一条省事，
  // 也避免"每帧都删一条"把淘汰本身变成热点
  if (highlightCache.size >= HIGHLIGHT_CACHE_MAX) {
    const drop = Math.ceil(HIGHLIGHT_CACHE_MAX / 4)
    let i = 0
    for (const k of highlightCache.keys()) {
      highlightCache.delete(k)
      if (++i >= drop) break
    }
  }
  highlightCache.set(key, html)
  return html
}

const md: MarkdownIt = new MarkdownIt({
  html: false, // 禁止原始 HTML，防注入
  linkify: true,
  breaks: true,
  typographer: true,
  highlight(code, lang) {
    // 缩进式代码块（``` 之外的）没有语言标签，`lang` 为空 → 返回空串，
    // markdown-it 会退回默认转义输出。带语言的走同一个缓存。
    return highlightCode(code, lang)
  }
})

// 链接新窗口打开 + 安全属性
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const href = token.attrGet('href') || ''
  // 仅外链加 target
  if (/^https?:\/\//i.test(href)) {
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noopener noreferrer')
  }
  return defaultLinkOpen(tokens, idx, options, env, self)
}

// 图片懒加载 + 样式钩子
md.renderer.rules.image = (tokens, idx, options, _env, self) => {
  const token = tokens[idx]
  token.attrSet('loading', 'lazy')
  token.attrSet('class', 'acu-md-img')
  return self.renderToken(tokens, idx, options)
}

/** 代码块 / 图表块共用的复制按钮（MarkdownRenderer 用 `.acu-code-copy` 委托命中它） */
function copyButtonHtml(encoded: string): string {
  return (
    `<button type="button" class="acu-code-copy" data-code="${encoded}" aria-label="复制代码">` +
    `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>` +
    `<span class="acu-code-copy-label">复制</span>` +
    `</button>`
  )
}

/**
 * ```mermaid 的占位块。
 *
 * 为什么只给占位不给 SVG：画图要 mermaid 本体（几百 KB）且是异步的，而这里是同步的
 * render 过程。占位块带上源码（`data-code`）和状态，DOM 挂载后由
 * `renderMermaidBlocks()` 把 SVG 补进 `.acu-mermaid-canvas`。
 *
 * 源码同时以 <pre> 形式渲染并默认隐藏：解析失败时直接露出来当降级，
 * 不用等第二次 render 再补一份源码。
 */
function mermaidBlockHtml(code: string): string {
  const L = mermaidLabels()
  const esc = md.utils.escapeHtml
  const encoded = encodeURIComponent(code)
  const sourceLabel = esc(L.source ?? '')
  const zoomLabel = esc(L.zoom ?? '')
  return (
    `<div class="acu-mermaid" data-code="${encoded}" data-state="pending" data-view="chart">` +
    `<div class="acu-mermaid-bar">` +
    `<span class="acu-mermaid-type">${esc(mermaidTypeLabel(code))}</span>` +
    `<span class="acu-mermaid-actions">` +
    `<button type="button" class="acu-mermaid-zoom" aria-label="${zoomLabel}">${zoomLabel}</button>` +
    `<button type="button" class="acu-mermaid-toggle" aria-label="${sourceLabel}">${sourceLabel}</button>` +
    copyButtonHtml(encoded) +
    `</span>` +
    `</div>` +
    `<div class="acu-mermaid-hint">` +
    `<span class="acu-typing-dots"><span></span><span></span><span></span></span>` +
    `<span class="acu-mermaid-hint-text">${esc(L.loading ?? '')}</span>` +
    `</div>` +
    `<div class="acu-mermaid-canvas"></div>` +
    `<pre class="acu-mermaid-source"><code>${esc(code)}</code></pre>` +
    `</div>`
  )
}

// 重写 fence（代码块）：包裹语言标签 + 复制按钮 header
md.renderer.rules.fence = (tokens, idx, _options, env) => {
  const token = tokens[idx]
  const info = token.info.trim()
  const lang = info ? info.split(/\s+/)[0] : ''
  const code = token.content
  const langLabel = lang || 'text'
  const encoded = encodeURIComponent(code)

  // ```mermaid 走图表链路；关掉时退回下面的普通代码块（源码仍然可见）
  if (isMermaidLang(lang) && isMermaidEnabled()) return mermaidBlockHtml(code)

  // 流式期里"还没写完的那个代码块"不高亮（见 render 的 options 说明）：
  // 它每一帧都在变，高亮它等于每帧重跑一次 shiki，而结果下一帧就作废。
  // 判定 = 这个 fence 一直延伸到文档末尾（未闭合的围栏 markdown-it 会把
  // map[1] 定在行尾）。已闭合的块不受影响，照常高亮、并且走缓存。
  const inFlight = !!env?.streaming && Array.isArray(token.map) && token.map[1] >= env.totalLines

  let inner = inFlight ? '' : highlightCode(code, lang)
  if (!inner) {
    const escaped = md.utils.escapeHtml(code)
    inner = `<pre class="shiki acu-code-fallback"><code>${escaped}</code></pre>`
  }

  return (
    `<div class="acu-code-block">` +
    `<div class="acu-code-header">` +
    `<span class="acu-code-lang">${md.utils.escapeHtml(langLabel)}</span>` +
    copyButtonHtml(encoded) +
    `</div>${inner}</div>`
  )
}

// —— think 块：识别 <think>...</think> 或 <think>...</think> ————
//
// 背景：部分模型（如 MiniMax-M3、DeepSeek 系）会把 reasoning 直接塞进
// content 流，用 <think>...</think> 或 <think>...</think> 包裹。
// 前端如果只解析 delta.reasoning_content 字段就会漏掉这部分。
//
// 触发位置不再要求"行首"：模型常常在段落中间插入，比如
//   "让我先确认项目结构。<think>确认了:..."
// 因此 block rule 在每行先扫描是否含有 <think*…开标签，命中后再向后
// 找结束标签；跨 chunk 的未闭合块返回 false，下次 source 增长时再扫。
const THINK_OPEN_RE = /<think>/g
const THINK_CLOSE = ['</think>', '</think>'] as const

/** 在文本中扫描所有已闭合的 think 段，返回 segments（数组）和 stripped（剩余正文）。 */
export function extractThinkSegments(
  source: string
): { reasoning: string; content: string } {
  if (!source) return { reasoning: '', content: '' }
  const segments: string[] = []
  let cursor = 0
  // 全文扫描，每找到一个 <think*…开始位置，就在剩余文本里找最近一个 </think>
  // 跨多行也算合法（标签之间允许任意字符）
  while (cursor < source.length) {
    THINK_OPEN_RE.lastIndex = cursor
    const open = THINK_OPEN_RE.exec(source)
    if (!open) break
    const openStart = open.index
    const openEnd = openStart + open[0].length
    const tail = source.slice(openEnd)
    // 找最近的结束标签（支持 <think> / <think> 两种）
    let closeIdx = -1
    let closeTagLen = 0
    for (const tag of THINK_CLOSE) {
      const i = tail.indexOf(tag)
      if (i !== -1 && (closeIdx === -1 || i < closeIdx)) {
        closeIdx = i
        closeTagLen = tag.length
      }
    }
    if (closeIdx === -1) break // 未闭合 → 留给下一次 source 增长再处理
    const thinkText = tail.slice(0, closeIdx).trim()
    if (thinkText) segments.push(thinkText)
    cursor = openEnd + closeIdx + closeTagLen
  }
  if (segments.length === 0) return { reasoning: '', content: source }
  const reasoning = segments.join('\n\n')
  // 剔除已抽取的 think 块（含标签本身），剩余部分作为正文
  const content = source.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  return { reasoning, content }
}

md.block.ruler.before(
  'paragraph',
  'think_block',
  (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine]
    const max = state.eMarks[startLine]
    const line = state.src.slice(start, max)

    // 找起始标签（行内任意位置都行，不再要求行首）
    THINK_OPEN_RE.lastIndex = start
    const openMatch = THINK_OPEN_RE.exec(line)
    if (!openMatch) return false
    const openIdx = openMatch.index
    if (silent) return true

    // 从 openIdx 之后扫描结束标签（先看同行；同行没有就向下找）
    let foundLine = -1
    let closeTag = ''
    let closeCol = -1
    for (let i = startLine; i < endLine; i++) {
      const lineStart = state.bMarks[i] + state.tShift[i]
      const lineMax = state.eMarks[i]
      const text = state.src.slice(lineStart, lineMax)
      const searchFrom = i === startLine ? start + openIdx + '<think>'.length : 0
      for (const tag of THINK_CLOSE) {
        const idx = text.indexOf(tag, searchFrom)
        if (idx !== -1 && (closeCol === -1 || idx < closeCol)) {
          closeCol = idx
          closeTag = tag
          foundLine = i
        }
      }
      if (foundLine !== -1) break
    }

    // 没找到结束符 → 还在 streaming → 让 markdown-it 按普通 paragraph 渲染
    if (foundLine < 0) return false

    // 提取起始标签和结束标签之间的内容（去标签，保留换行）
    const lines: string[] = []
    for (let i = startLine; i <= foundLine; i++) {
      const lineStart = state.bMarks[i] + state.tShift[i]
      const lineMax = state.eMarks[i]
      let text = state.src.slice(lineStart, lineMax)
      if (i === startLine) text = text.slice(openIdx + '<think>'.length)
      if (i === foundLine) text = text.slice(0, text.indexOf(closeTag))
      lines.push(text)
    }
    const thinkContent = lines.join('\n').trim()

    const token = state.push('think_block', '', 0)
    token.content = thinkContent
    token.map = [startLine, foundLine + 1]
    token.markup = '<think>'
    token.block = true

    state.line = foundLine + 1
    return true
  }
)

const defaultThinkRender =
  md.renderer.rules.think_block ||
  ((tokens, idx, _options, env) => {
    const token = tokens[idx]
    // 思考块的正文是**另一份文本**，行数得按它自己数；流式标记照传下去，
    // 否则思考里正在写的那个代码块会在每帧重新高亮一次（见 render 的 options）
    const innerEnv = env?.streaming
      ? { streaming: true, totalLines: countLines(token.content) }
      : {}
    const inner = token.content.trim() ? md.render(token.content, innerEnv) : ''
    // 复用 ThinkingBlock 的 .acu-thinking 结构（样式见 base.scss）
    // 这里只输出 HTML 结构，折叠交互由 ThinkingBlock 组件提供，
    // markdown 中默认展开
    return (
      `<div class="acu-thinking acu-thinking-md">` +
      `<button type="button" class="acu-thinking-header">` +
      `<span class="acu-thinking-icon">` +
      `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M9.5 2A4.5 4.5 0 0 0 5 6.5c0 .5.08.98.22 1.43A4 4 0 0 0 6 16a3.5 3.5 0 0 0 5 3.05"/>` +
      `<path d="M14.5 2A4.5 4.5 0 0 1 19 6.5c0 .5-.08.98-.22 1.43A4 4 0 0 1 18 16a3.5 3.5 0 0 1-5 3.05"/>` +
      `<path d="M12 4v16"/>` +
      `</svg>` +
      `</span>` +
      `<span class="acu-thinking-title">思考</span>` +
      `</button>` +
      `<div class="acu-thinking-body is-scrollable is-scrollbar-hover">${inner}</div>` +
      `</div>`
    )
  })
md.renderer.rules.think_block = defaultThinkRender

export interface UseMarkdownReturn {
  render: (source: string, options?: RenderOptions) => string
  renderInline: (source: string) => string
  ensureHighlighter: typeof ensureHighlighter
}

export interface RenderOptions {
  /**
   * 正文是否仍在流式输出。
   *
   * 为 true 时**只**把"还没闭合的那个尾随代码块"按纯文本渲染 —— 它每一帧都在变，
   * 高亮它的结果下一帧就作废（一次 12KB 的流式回答实测 6.4s 主线程全砸在这上面）。
   * 已经闭合的代码块照常高亮，而且走缓存，几乎免费。
   *
   * 不传 = 全量高亮（历史消息都走这条路）。流结束后**必须**用不传的这版再渲染一次，
   * 否则最后一个代码块会停在没有高亮的降级态。
   * @default false
   */
  streaming?: boolean
}

/**
 * markdown-it 内部会把 \r\n / \r 规范成 \n，所以行数也要按同一口径数，
 * 否则 CRLF 文档上 `totalLines` 会偏大、围栏判定失效。
 */
function countLines(source: string): number {
  return source.replace(/\r\n?/g, '\n').split('\n').length
}

export function useMarkdown(): UseMarkdownReturn {
  return {
    render(source: string, options?: RenderOptions): string {
      const src = source || ''
      // env 只在流式时才带东西：非流式渲染的 env 与旧版逐字一致（`{}` 里的东西
      // 不影响任何渲染规则），历史消息的 HTML 因此与改前完全一样。
      const env = options?.streaming ? { streaming: true, totalLines: countLines(src) } : {}
      return md.render(src, env)
    },
    renderInline(source: string): string {
      return md.renderInline(source || '')
    },
    ensureHighlighter
  }
}
