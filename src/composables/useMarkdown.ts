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
