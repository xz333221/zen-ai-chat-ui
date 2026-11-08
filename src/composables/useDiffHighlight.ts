// ============================================================
// ai-chat-ui · diff 语法高亮
//
// 复用 Markdown 那条 highlighter 单例（同一套 github-light / github-dark），
// 输出「每行一段 HTML」，供 FileChangeDiff 逐行塞进 v-html。
//
// 为什么按行给：diff 的行结构（+ / − / 行号 / 底色）必须由 Vue 管，
// 不能让 shiki 输出的 <pre> 整块贴进来 —— 否则行号、增删底色都无处可放。
// ============================================================
import type { BundledLanguage } from 'shiki'
import { ensureHighlighter } from './useMarkdown'
import { escapeHtml } from '@/utils/diff'

/**
 * 缓存 `语言\0代码` → 每行 HTML。
 *
 * diff 是「点开才渲染」的，一次只有一份，但用户会反复开合、来回切文件；
 * 同一份 patch 的高亮结果没必要重算（shiki 单次几十毫秒，开合时看得出来）。
 */
const CACHE_MAX = 60
const cache = new Map<string, string[]>()

/** shiki 的 FontStyle 是位运算枚举：1 斜体 / 2 粗体 / 4 下划线 / 8 删除线 */
function fontStyleCss(style: number | undefined): string {
  if (!style) return ''
  const parts: string[] = []
  if (style & 1) parts.push('italic')
  if (style & 2) parts.push('bold')
  if (style & 4) parts.push('underline')
  if (style & 8) parts.push('line-through')
  return parts.join(' ')
}

/**
 * `.vue` / `.svelte` 是「容器语法」：shiki 的 grammar 只认带标签的整段单文件组件。
 * 而 diff 的一个 hunk 经常只有 `<script>` 里的几行（外面没有 script / template 标签），
 * vue grammar 会把它整段判成纯文本 —— 结果就是「看起来完全没高亮」，实测 78 个 token 里
 * 76 个拿到默认前景色。片段里看不到标签时，按里面的方言（TypeScript）高亮。
 */
const CONTAINER_LANGS = new Set(['vue', 'svelte'])

/** 出现这些标签才算真的 SFC / 模板片段，交给 vue|svelte 语法 */
const MARKUP_HINT_RE =
  /<\/?(?:template|script|style|div|span|section|article|aside|nav|header|footer|main|ul|ol|li|p|a|button|input|img|svg|path|slot|component|textarea|select|table|tbody|tr|td|th|h[1-6])\b/i

function resolveDiffLang(code: string, lang: string): string {
  if (!CONTAINER_LANGS.has(lang)) return lang
  return MARKUP_HINT_RE.test(code) ? lang : 'typescript'
}

/**
 * 高亮一段代码，返回与行数一一对应的 HTML 数组；失败 / 语言不可用返回 null，
 * 调用方退回纯文本。
 */
export async function highlightDiff(code: string, lang: string): Promise<string[] | null> {
  if (!code || !lang) return null
  const target = resolveDiffLang(code, lang)
  const key = `${target}\u0000${code}`
  const cached = cache.get(key)
  if (cached) return cached

  const highlighter = await ensureHighlighter()
  if (!highlighter) return null

  try {
    if (!highlighter.getLoadedLanguages().includes(target)) {
      await highlighter.loadLanguage(target as BundledLanguage)
    }
    const tokenLines = highlighter.codeToTokensWithThemes(code, {
      lang: target as BundledLanguage,
      themes: { light: 'github-light', dark: 'github-dark' }
    })
    const lines = tokenLines.map((line) =>
      line
        .map((token) => {
          const light = token.variants.light
          const dark = token.variants.dark
          const styles: string[] = []
          if (light?.color) styles.push(`--shiki-light:${light.color}`)
          if (dark?.color) styles.push(`--shiki-dark:${dark.color}`)
          // 字体样式两套主题一般一致，取浅色那份即可（斜体注释是能看出来的一档差别）
          const fontStyle = fontStyleCss(light?.fontStyle)
          if (fontStyle) styles.push(`font-style:${fontStyle}`)
          const content = escapeHtml(token.content)
          return styles.length ? `<span style="${styles.join(';')}">${content}</span>` : content
        })
        .join('')
    )

    if (cache.size >= CACHE_MAX) {
      const drop = Math.ceil(CACHE_MAX / 4)
      let i = 0
      for (const k of cache.keys()) {
        cache.delete(k)
        if (++i >= drop) break
      }
    }
    cache.set(key, lines)
    return lines
  } catch {
    // 语言没打进包里 / 语法有问题：退回纯文本，不影响阅读
    return null
  }
}
