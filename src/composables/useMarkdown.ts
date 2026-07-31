// ============================================================
// ai-chat-ui · Markdown 渲染（markdown-it + Shiki 双主题高亮）
// 模块级单例：highlighter 异步预加载，未就绪时降级为纯文本代码块，
// 就绪后通过 isReady 触发组件重新渲染。
// ============================================================
import { ref, type Ref } from 'vue'
import MarkdownIt from 'markdown-it'
import { createHighlighter, type Highlighter } from 'shiki'

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

const md: MarkdownIt = new MarkdownIt({
  html: false, // 禁止原始 HTML，防注入
  linkify: true,
  breaks: true,
  typographer: true,
  highlight(code, lang) {
    if (highlighter && lang) {
      try {
        return highlighter.codeToHtml(code, {
          lang,
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false // 输出双主题 CSS 变量，由 [data-theme] 切换
        })
      } catch {
        // 未知语言，降级
      }
    }
    // 降级：返回空串让 markdown-it 用默认转义输出 <pre><code>
    return ''
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

// 重写 fence（代码块）：包裹语言标签 + 复制按钮 header
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const info = token.info.trim()
  const lang = info ? info.split(/\s+/)[0] : ''
  const code = token.content
  const langLabel = lang || 'text'
  const encoded = encodeURIComponent(code)

  let inner = ''
  if (highlighter && lang) {
    try {
      inner = highlighter.codeToHtml(code, {
        lang,
        themes: { light: 'github-light', dark: 'github-dark' },
        defaultColor: false
      })
    } catch {
      inner = ''
    }
  }
  if (!inner) {
    const escaped = md.utils.escapeHtml(code)
    inner = `<pre class="shiki acu-code-fallback"><code>${escaped}</code></pre>`
  }

  return (
    `<div class="acu-code-block">` +
    `<div class="acu-code-header">` +
    `<span class="acu-code-lang">${md.utils.escapeHtml(langLabel)}</span>` +
    `<button type="button" class="acu-code-copy" data-code="${encoded}" aria-label="复制代码">` +
    `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>` +
    `<span class="acu-code-copy-label">复制</span>` +
    `</button>` +
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
  ((tokens, idx) => {
    const token = tokens[idx]
    const inner = token.content.trim() ? md.render(token.content) : ''
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
      `<div class="acu-thinking-body">${inner}</div>` +
      `</div>`
    )
  })
md.renderer.rules.think_block = defaultThinkRender

export interface UseMarkdownReturn {
  render: (source: string) => string
  renderInline: (source: string) => string
  ensureHighlighter: typeof ensureHighlighter
}

export function useMarkdown(): UseMarkdownReturn {
  return {
    render(source: string): string {
      return md.render(source || '')
    },
    renderInline(source: string): string {
      return md.renderInline(source || '')
    },
    ensureHighlighter
  }
}
