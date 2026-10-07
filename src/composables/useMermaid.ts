// ============================================================
// ai-chat-ui · Mermaid 图表渲染
//
// 为什么单独一条链路，而不是交给 shiki：
//   ```mermaid 要的是「画出来」而不是「高亮」。shiki 没有 mermaid 语法，
//   只会把它当未知语言降级成一坨纯文本 —— 模型画的流程图在界面上永远是源码。
//
// 为什么动态 import + 外部依赖：
//   mermaid 全家桶（d3 / dagre / cytoscape / katex …）比整个组件库还大。
//   静态 import 等于让「从不输出流程图」的宿主白付这份体积；所以只在真的
//   遇到 ```mermaid 时才 import()，并且和 vue / markdown-it / shiki 一样列进
//   rollupOptions.external —— mermaid 是 dependency，由消费方安装，不进库产物。
//
// 为什么是 DOM 补渲染而不是 Vue 组件：
//   Markdown 正文走的是 v-html（见 MarkdownRenderer），v-html 里挂不了组件。
//   所以 fence 先吐一个占位块，DOM 就绪后再由 renderMermaidBlocks() 把 SVG 填进去
//   —— 和代码块复制按钮同一套路。
//
// 流式输出怎么办：
//   mermaid 是「整段解析」，半截源码要么报错要么画出一张错的图。所以正文还在
//   流式时只挂占位态、不渲染（也不加载 mermaid 本体），等 streaming 翻回 false
//   再一次性画出来。宿主不给 streaming 标记时兜底：照样尝试渲染，失败就露源码。
// ============================================================
import { ref, type Ref } from 'vue'
import type { MermaidBlockConfig, MermaidLabels, MermaidState } from '@/types'

/** 运行时才 import 的 mermaid 模块类型（纯类型引用，不会打进产物） */
type MermaidApi = typeof import('mermaid')['default']

/** 识别为图表的代码块语言（```mmd 是 mermaid 的老缩写，一并认掉） */
export const MERMAID_LANGS = ['mermaid', 'mmd'] as const

/** 图表块的根选择器：fence 输出的占位块 + 补渲染都靠它对齐 */
export const MERMAID_SELECTOR = '.acu-mermaid'

/** 图表类型文案。键是 mermaid 源码里的首个关键字（小写） */
export const MERMAID_TYPE_NAMES: Record<string, string> = {
  graph: '流程图',
  flowchart: '流程图',
  'flowchart-v2': '流程图',
  sequencediagram: '时序图',
  classdiagram: '类图',
  statediagram: '状态图',
  'statediagram-v2': '状态图',
  erdiagram: 'ER 图',
  gantt: '甘特图',
  pie: '饼图',
  journey: '用户旅程图',
  mindmap: '思维导图',
  timeline: '时间线',
  quadrantchart: '象限图',
  gitgraph: 'Git 图',
  xychart: '折线图',
  'xychart-beta': '折线图',
  block: '块图',
  'block-beta': '块图',
  c4context: 'C4 上下文图',
  c4container: 'C4 容器图',
  c4component: 'C4 组件图',
  c4dynamic: 'C4 动态图',
  c4deployment: 'C4 部署图',
  requirementdiagram: '需求图',
  sankey: '桑基图',
  'sankey-beta': '桑基图',
  packet: '报文图',
  'packet-beta': '报文图',
  architecture: '架构图',
  'architecture-beta': '架构图',
  radar: '雷达图',
  'radar-beta': '雷达图',
  treemap: '矩形树图',
  'treemap-beta': '矩形树图'
}

/** 认不出类型时的兜底标题 */
const FALLBACK_TYPE_NAME = '图表'

const DEFAULT_LABELS: Required<MermaidLabels> = {
  /** 切到源码视图 */
  source: '源码',
  /** 切回图表视图 */
  chart: '图表',
  /** 图表还在生成（流式中） */
  loading: '正在生成图表…',
  /** 渲染失败，正文降级为源码 */
  error: '图表渲染失败，已显示源码',
  /** 图表头「放大」（打开全屏查看器） */
  zoom: '放大',
  /** 查看器：放大一档 */
  zoomIn: '放大',
  /** 查看器：缩小一档 */
  zoomOut: '缩小',
  /** 查看器：回到适应窗口 */
  zoomReset: '适应窗口',
  /** 查看器：关闭 */
  close: '关闭',
  /** 查看器底部提示 */
  zoomHint: '滚轮缩放 · 拖动平移 · 双击复位 · Esc 关闭'
}

// —— 主题变量 ——
//
// 每个 mermaid 变量对应一个 --acu-* 令牌，外加一份深浅色兜底常量。
// 为什么要读令牌而不是写死：宿主换肤（改 --acu-primary 等）时图表要跟着一起变，
// 否则正文是新配色、图还是默认靛蓝，一眼看出是两套东西。
// 为什么要兜底：令牌可能被宿主写成 color-mix() / var() 这类 khroma 解析不了的值
// （mermaid 内部要做 lighten/darken 计算），拿到非纯色就退回兜底常量。
//
// 兜底值不是拍脑袋：直接从 theme.scss 的两套色板抄下来，改色板时一并改这里。
type ThemeToken = [key: string, token: string | null, light: string, dark: string]

const THEME_TOKENS: ThemeToken[] = [
  ['background', null, 'transparent', 'transparent'],
  // 节点：淡主色填充 + 实主色描边。满饱和的实心方块铺满一张图会非常吵
  ['primaryColor', '--acu-primary-soft', 'rgba(99, 102, 241, 0.09)', 'rgba(129, 140, 248, 0.14)'],
  ['primaryBorderColor', '--acu-primary', '#6366f1', '#818cf8'],
  ['primaryTextColor', '--acu-text', '#18181b', '#f4f4f5'],
  ['mainBkg', '--acu-primary-soft', 'rgba(99, 102, 241, 0.09)', 'rgba(129, 140, 248, 0.14)'],
  ['nodeBorder', '--acu-primary', '#6366f1', '#818cf8'],
  ['nodeTextColor', '--acu-text', '#18181b', '#f4f4f5'],
  ['secondaryColor', '--acu-surface', '#f7f8fa', '#24242b'],
  ['secondaryBorderColor', '--acu-border', '#e8e9ef', '#2b2b33'],
  ['secondaryTextColor', '--acu-text', '#18181b', '#f4f4f5'],
  ['tertiaryColor', '--acu-surface-2', '#eef0f4', '#2f2f39'],
  ['tertiaryBorderColor', '--acu-border', '#e8e9ef', '#2b2b33'],
  ['tertiaryTextColor', '--acu-text', '#18181b', '#f4f4f5'],
  // 连线/箭头（流程图的边、类图关系线、时序图生命线）：
  // 原来取的是 --acu-border-strong —— 那是给正文「分隔线」用的档位，当图形连线太淡了：
  // 实测浅色 #d6d8e0 对白底只有 1.44:1、深色 #55555f 对 #1e1e25 只有 2.25:1，
  // 都不到 WCAG 对图形对象的 3:1；深色主题里那些箭头基本是「糊」的。
  // 换成 --acu-text-muted（浅 #74747e ≈ 4.7:1 / 深 #93939f ≈ 5.4:1）—— 同一套色阶里
  // 唯一既够对比、又不会被误读成「正文」的一档。
  ['lineColor', '--acu-text-muted', '#74747e', '#93939f'],
  ['textColor', '--acu-text', '#18181b', '#f4f4f5'],
  ['titleColor', '--acu-text', '#18181b', '#f4f4f5'],
  // 子图（subgraph）用最浅一档底色 + 发丝边，别抢节点的视线
  ['clusterBkg', '--acu-surface', '#f7f8fa', '#24242b'],
  ['clusterBorder', '--acu-border', '#e8e9ef', '#2b2b33'],
  ['edgeLabelBackground', '--acu-card-bg', '#ffffff', '#1e1e25'],
  ['noteBkgColor', '--acu-surface-2', '#eef0f4', '#2f2f39'],
  ['noteBorderColor', '--acu-border-strong', '#d6d8e0', '#55555f'],
  ['noteTextColor', '--acu-text', '#18181b', '#f4f4f5'],
  ['errorBkgColor', '--acu-error-soft', 'rgba(239, 68, 68, 0.1)', 'rgba(248, 113, 113, 0.14)'],
  ['errorTextColor', '--acu-error', '#ef4444', '#f87171'],
  // 时序图
  ['actorBkg', '--acu-primary-soft', 'rgba(99, 102, 241, 0.09)', 'rgba(129, 140, 248, 0.14)'],
  ['actorBorder', '--acu-primary', '#6366f1', '#818cf8'],
  ['actorTextColor', '--acu-text', '#18181b', '#f4f4f5'],
  // 生命线同样是「连线」，跟 lineColor 同一档（原来的 border-strong 在深色下几乎看不见）
  ['actorLineColor', '--acu-text-muted', '#74747e', '#93939f'],
  ['signalColor', '--acu-text-secondary', '#54545e', '#a5a5b0'],
  ['signalTextColor', '--acu-text', '#18181b', '#f4f4f5'],
  ['labelBoxBkgColor', '--acu-surface', '#f7f8fa', '#24242b'],
  ['labelBoxBorderColor', '--acu-border-strong', '#d6d8e0', '#55555f'],
  ['labelTextColor', '--acu-text', '#18181b', '#f4f4f5'],
  ['loopTextColor', '--acu-text-secondary', '#54545e', '#a5a5b0'],
  ['activationBkgColor', '--acu-surface-2', '#eef0f4', '#2f2f39'],
  ['activationBorderColor', '--acu-primary', '#6366f1', '#818cf8'],
  ['sequenceNumberColor', '--acu-card-bg', '#ffffff', '#1e1e25']
]

/** 只接受「纯色」写法：mermaid 内部会对这些值做颜色运算，函数式颜色会炸 */
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i

/** 渲染结果缓存上限（按「主题 + 源码」两条轴共用这个额度） */
const CACHE_LIMIT = 60

const svgCache = new Map<string, string>()
/**
 * 用户手动切到「源码」视图的图表（按源码记，不跟主题走）。
 *
 * 为什么要模块级：正文 DOM 是每次 render 重建的（流式、Shiki 就绪、换主题都会重建），
 * 视图偏好存在元素上会在下一次重建时丢掉，用户会看到自己刚切到源码的图又弹回图表。
 * 用源码当键而不是元素引用，重建后按同一段代码就能还原视图。
 */
const sourceViewCodes = new Set<string>()

// —— 模块级状态 ——
let mermaidPromise: Promise<MermaidApi | null> | null = null
let initedTheme: 'light' | 'dark' | null = null
let initedVersion = -1
/** setMermaidConfig 的版本号：配置变了要重新 initialize */
let configVersion = 0
/** 串行化渲染：mermaid 的 initialize / render 共享全局配置，交错执行会画出上一套配色 */
let renderQueue: Promise<unknown> = Promise.resolve()
let renderSeq = 0

/** mermaid 本体是否已加载好（和 isShikiReady 同构，宿主可用来做进度提示） */
export const isMermaidReady: Ref<boolean> = ref(false)

let userConfig: MermaidBlockConfig = {}

/**
 * 覆盖图表渲染配置（全局生效，对之后渲染的所有图表块有效）。
 *
 * ```ts
 * setMermaidConfig({ enabled: false })                    // 整个关掉，```mermaid 退回普通代码块
 * setMermaidConfig({ themeVariables: { dark: { primaryColor: '#123456' } } })
 * setMermaidConfig({ options: { securityLevel: 'loose' } }) // 透传给 mermaid.initialize
 * setMermaidConfig({ labels: { source: 'Code', chart: 'Diagram', error: '…' } })
 * ```
 */
export function setMermaidConfig(config: MermaidBlockConfig): void {
  const fitChanged = config.minScale !== undefined && config.minScale !== userConfig.minScale
  userConfig = { ...userConfig, ...config }
  configVersion++
  // 主题相关配置变了，下一次渲染必须重新 initialize
  initedTheme = null
  // 缩放下限是**画完之后**才用的：现成的图不用重画，重新适配一次就行
  if (fitChanged) FIT_TARGETS.forEach((canvas) => fitMermaidCanvas(canvas))
}

/** 图表渲染是否启用（默认启用，`setMermaidConfig({ enabled: false })` 关掉） */
export function isMermaidEnabled(): boolean {
  return userConfig.enabled !== false
}

function labels(): Required<MermaidLabels> {
  const o = userConfig.labels || {}
  return {
    source: o.source ?? DEFAULT_LABELS.source,
    chart: o.chart ?? DEFAULT_LABELS.chart,
    loading: o.loading ?? DEFAULT_LABELS.loading,
    error: o.error ?? DEFAULT_LABELS.error,
    zoom: o.zoom ?? DEFAULT_LABELS.zoom,
    zoomIn: o.zoomIn ?? DEFAULT_LABELS.zoomIn,
    zoomOut: o.zoomOut ?? DEFAULT_LABELS.zoomOut,
    zoomReset: o.zoomReset ?? DEFAULT_LABELS.zoomReset,
    close: o.close ?? DEFAULT_LABELS.close,
    zoomHint: o.zoomHint ?? DEFAULT_LABELS.zoomHint
  }
}

/**
 * 当前生效的图表文案（fence 生成占位块时要用，所以对外暴露一份）。
 * 注意：文案是在 **render 时** 读的，改配置后需要宿主重新渲染正文才生效。
 */
export function mermaidLabels(): Required<MermaidLabels> {
  return labels()
}

/**
 * 图表类型文案：从源码首个关键字判断（`sequenceDiagram` → 时序图）。
 *
 * mermaid 允许开头有 front-matter（`---` 包起来的 title/config）和 `%%` 注释，
 * 直接取第一行会取到 `---`，所以要先跳过这两类。
 */
export function mermaidTypeLabel(code: string): string {
  const names = { ...MERMAID_TYPE_NAMES, ...userConfig.typeNames }
  let inFrontMatter = false
  for (const raw of (code || '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line === '---') {
      inFrontMatter = !inFrontMatter
      continue
    }
    if (inFrontMatter || line.startsWith('%%')) continue
    const word = /^([A-Za-z][\w-]*)/.exec(line)
    if (!word) continue
    const key = word[1].toLowerCase()
    // 有些图类型带 `-beta` 后缀，先整体匹配，再退一步去掉后缀
    return names[key] || names[key.replace(/-beta$/, '')] || FALLBACK_TYPE_NAME
  }
  return FALLBACK_TYPE_NAME
}

/** 首帧就按关键字判断类型 —— 还没解析成功时，标题也能给出「这是个什么图」 */
export function isMermaidLang(lang: string): boolean {
  const l = (lang || '').toLowerCase()
  return (MERMAID_LANGS as readonly string[]).includes(l)
}

// —— 主题 ——

function tokenColor(el: Element | null, token: string | null): string | null {
  if (!el || !token || typeof getComputedStyle !== 'function') return null
  try {
    const value = getComputedStyle(el).getPropertyValue(token).trim()
    return value && COLOR_RE.test(value) ? value : null
  } catch {
    return null
  }
}

const LENGTH_RE = /^\d+(\.\d+)?(px|rem|em)$/

function tokenLength(el: Element | null, token: string, fallback: string): string {
  if (!el || typeof getComputedStyle !== 'function') return fallback
  try {
    const value = getComputedStyle(el).getPropertyValue(token).trim()
    return LENGTH_RE.test(value) ? value : fallback
  } catch {
    return fallback
  }
}

function buildThemeVariables(el: Element | null, theme: 'light' | 'dark'): Record<string, string> {
  const dark = theme === 'dark'
  const vars: Record<string, string> = {}
  for (const [key, token, light, darkValue] of THEME_TOKENS) {
    vars[key] = tokenColor(el, token) ?? (dark ? darkValue : light)
  }
  // 字号必须走 themeVariables：流程图默认开 htmlLabels，节点文字是 foreignObject 里的
  // HTML，字号由主题 CSS（`#id .nodeLabel{font-size:…}`）决定，看的是 themeVariables.fontSize
  // —— 顶层那个 `fontSize` 只对时序图 / 甘特图这类直接读 config 的图生效。
  // 只设顶层的话会出现「时序图 14px、流程图 16px」的字号不一致。
  vars.fontSize = tokenLength(el, '--acu-font-size-base', '14px')
  const override = userConfig.themeVariables?.[theme]
  return override ? { ...vars, ...override } : vars
}

function buildOptions(el: Element | null, theme: 'light' | 'dark'): Record<string, unknown> {
  const fontFamily =
    (el && typeof getComputedStyle === 'function'
      ? getComputedStyle(el).getPropertyValue('--acu-font-sans').trim()
      : '') || undefined
  return {
    startOnLoad: false,
    // strict：SVG 输出走 DOMPurify 清洗。模型输出是不可信内容，这里不能松
    securityLevel: 'strict',
    // 解析失败时不要在 body 里留一张「错误示意图」（下面还会兜底清理临时容器）
    suppressErrorRendering: true,
    theme: 'base',
    themeVariables: buildThemeVariables(el, theme),
    // 时序图 / 甘特图这类直接读 config.fontSize 的图型（流程图的字号在 themeVariables 里）
    fontSize: '14px',
    // 甘特图的字号**不走 themeVariables**：它读自己的 gantt.fontSize / sectionFontSize，
    // 默认 11px —— 比正文小两档，窄一点就彻底读不动。这里跟正文对齐。
    // ⚠️ 必须是**数字**：渲染器里拿它做算术（`conf.fontSize / 2 - 2`），传 '14px' 会算出 NaN。
    gantt: { fontSize: 14, sectionFontSize: 14 },
    ...(fontFamily ? { fontFamily } : {}),
    ...(userConfig.options || {})
  }
}

/**
 * 给渲出来的 SVG 补一条 CSS：甘特图的日期刻度。
 *
 * 渲染器里那两处刻度是**写死的** `attr("font-size", 10)` + `fill="#000"`，配置改不到；
 * 但它们是 SVG **呈现属性**（presentation attribute），优先级低于任何 CSS 规则 ——
 * 所以一条带 id 前缀的规则就能把字号抬起来。（颜色不用管：mermaid 自己那条
 * `#id{fill:…}` 已经盖掉了写死的黑色。）
 *
 * 10px 的日期在窄面板里认不出是哪天，抬到 12px（库的「小字」一档）。
 */
function decorateSvg(svg: string, id: string): string {
  return svg.replace(/<svg[^>]*>/, (tag) => `${tag}<style>#${id} .grid .tick text{font-size:12px}</style>`)
}

/** 当前生效的深浅色：优先看最近的 [data-theme]（组件库自己挂的），其次系统偏好 */
export function resolveMermaidTheme(el: Element | null): 'light' | 'dark' {
  const carrier = el?.closest?.('[data-theme]') ?? (typeof document !== 'undefined' ? document.documentElement : null)
  const attr = carrier?.getAttribute?.('data-theme')
  if (attr === 'dark') return 'dark'
  if (attr === 'light') return 'light'
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

/**
 * 监听主题切换（`[data-theme]` 属性变化），返回取消监听的函数。
 *
 * 图表 SVG 的颜色是烘进 SVG 里的（不像正文那样走 CSS 变量），换主题必须重画。
 * 缓存按主题分键，所以来回切只会各画一次。
 */
export function observeMermaidTheme(el: HTMLElement | null, onChange: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => {}
  const carrier =
    el?.closest?.('[data-theme]') ??
    (typeof document !== 'undefined' ? document.documentElement : null)
  if (!carrier) return () => {}
  const observer = new MutationObserver(onChange)
  observer.observe(carrier, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

// —— 渲染 ——

function cacheGet(key: string): string | undefined {
  const hit = svgCache.get(key)
  if (hit !== undefined) {
    // 触碰即刷新（Map 保持插入序，删最老的即 LRU 的近似）
    svgCache.delete(key)
    svgCache.set(key, hit)
  }
  return hit
}

function cacheSet(key: string, svg: string): void {
  svgCache.set(key, svg)
  while (svgCache.size > CACHE_LIMIT) {
    const oldest = svgCache.keys().next().value
    if (oldest === undefined) break
    svgCache.delete(oldest)
  }
}

/** mermaid 解析失败时会在 body 里留下临时容器（`#d<id>`），不清就是一段游离 DOM */
function removeTemp(id: string): void {
  if (typeof document === 'undefined') return
  document.getElementById(`d${id}`)?.remove()
  document.getElementById(id)?.remove()
}

function loadMermaid(): Promise<MermaidApi | null> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid')
      .then((mod) => {
        const api = ((mod as { default?: MermaidApi }).default ?? mod) as MermaidApi
        isMermaidReady.value = true
        return api
      })
      .catch((err) => {
        // 加载失败不是错误态：正文会降级成源码（见 fail()），不该往控制台丢红字吓用户
        console.warn('[ai-chat-ui] Mermaid 加载失败，图表将降级为源码显示:', err)
        return null
      })
  }
  return mermaidPromise
}

async function ensureMermaid(el: Element | null, theme: 'light' | 'dark'): Promise<MermaidApi | null> {
  const api = await loadMermaid()
  if (!api) return null
  if (initedTheme !== theme || initedVersion !== configVersion) {
    api.initialize(buildOptions(el, theme) as never)
    initedTheme = theme
    initedVersion = configVersion
  }
  return api
}

/**
 * 渲染一段 mermaid 源码为 SVG 字符串（带缓存；同一段源码 + 同一主题只画一次）。
 *
 * @param code  mermaid 源码
 * @param theme 目标主题（深浅），决定配色
 * @param el    取色 / 量字体的参照元素（一般是图表块本身，用来读 --acu-* 令牌）
 */
export function renderMermaid(
  code: string,
  theme: 'light' | 'dark',
  el?: Element | null
): Promise<string> {
  const key = `${theme}\u0000${code}`
  const cached = cacheGet(key)
  if (cached !== undefined) return Promise.resolve(cached)

  const run = async (): Promise<string> => {
    const api = await ensureMermaid(el ?? null, theme)
    if (!api) throw new Error('mermaid-unavailable')
    const id = `acu-mmd-${++renderSeq}`
    try {
      const { svg } = await api.render(id, code)
      const decorated = decorateSvg(svg, id)
      cacheSet(key, decorated)
      return decorated
    } catch (err) {
      removeTemp(id)
      throw err
    }
  }

  // 排队而不是并发：initialize 改的是全局配置，两个渲染交错时后一个的配色会串到前一个
  const task = renderQueue.then(run, run)
  renderQueue = task.catch(() => undefined)
  return task
}

// —— DOM 补渲染 ——

export interface MermaidHydrateOptions {
  /** 该容器里的正文是否还在流式输出：流式中只挂占位态，不画图 */
  streaming?: boolean
}

function setState(el: HTMLElement, state: MermaidState): void {
  el.dataset.state = state
}

function applyView(el: HTMLElement, showSource: boolean): void {
  el.dataset.view = showSource ? 'source' : 'chart'
  const toggle = el.querySelector<HTMLElement>('.acu-mermaid-toggle')
  if (toggle) {
    const text = showSource ? labels().chart : labels().source
    toggle.textContent = text
    toggle.setAttribute('aria-label', text)
  }
}

function paint(el: HTMLElement, svg: string, theme: 'light' | 'dark'): void {
  const canvas = el.querySelector<HTMLElement>('.acu-mermaid-canvas')
  if (!canvas) return
  // svg 来自 mermaid 在 securityLevel: 'strict' 下经 DOMPurify 清洗的输出
  canvas.innerHTML = svg
  // 记下这张图是用哪套配色画的：主题切了它就成了「过期的图」，下次要重画
  //
  // ⚠️ 属性名是 data-mermaid-theme 而不是 data-theme —— 后者是组件库自己的主题开关
  // （见 theme.scss 的 `[data-theme='dark']`）。图表块上再挂一个 data-theme='light'，
  // 就会把祖先的深色主题**局部覆盖掉**：下一轮取色读到的是自己这层浅色令牌，
  // 于是「切到深色后重画的图仍然是浅色配色」，而且块内的源码区也跟着变浅。
  el.dataset.mermaidTheme = theme
  setState(el, 'done')
  fitMermaidCanvas(canvas)
  observeFit(canvas)
}

// —— 缩放下限：容器不够宽时，别把整张图等比缩小 —— //
//
// mermaid 输出的是 `width="100%"` + `style="max-width: 自然宽"`：容器比图窄时它
// **整张等比缩小**，字跟着一起缩。实测 420px 的面板里，993px 宽的流程图被压到 0.39 倍
// （14px 正文等效 5.5px），甘特图 0.30 倍（4.2px）—— 这就是「流程图看不清」的根。
//
// 所以给缩小划一条底线（默认 0.8 倍 ≈ 11px）：越过底线就改成**保持原始尺寸 + 横向滚动**
// （画布本来就是 overflow-x: auto）。想看全貌可以点「放大」进全屏查看器。
//
// 用 ResizeObserver 跟着容器宽度重算：宿主拖分隔条 / 开合侧栏都会变宽变窄，
// 只有窗口 resize 事件是不够的。
const FIT_TARGETS = new Set<HTMLElement>()
let fitObserver: ResizeObserver | null = null

function ensureFitObserver(): ResizeObserver | null {
  if (fitObserver || typeof ResizeObserver === 'undefined') return fitObserver
  fitObserver = new ResizeObserver((entries) => {
    for (const entry of entries) fitMermaidCanvas(entry.target as HTMLElement)
  })
  return fitObserver
}

/** 已经不挂在文档上的画布（流式每帧重建 DOM）要从观察名单里摘掉，否则越积越多 */
function pruneFitTargets(): void {
  for (const t of [...FIT_TARGETS]) {
    if (t.isConnected) continue
    fitObserver?.unobserve(t)
    FIT_TARGETS.delete(t)
  }
}

/** 图表的自然宽度：优先读 mermaid 写进 style 的 max-width，其次退回 viewBox */
function naturalWidthOf(svg: SVGSVGElement): number {
  const m = /max-width:\s*([\d.]+)px/.exec(svg.getAttribute('style') || '')
  if (m) return parseFloat(m[1])
  const parts = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/)
  const w = Number(parts[2])
  return Number.isFinite(w) && w > 0 ? w : 0
}

function fitMermaidCanvas(canvas: HTMLElement): void {
  const svg = canvas.querySelector('svg')
  if (!svg) return
  const natural = naturalWidthOf(svg)
  if (!natural) return
  const cs = getComputedStyle(canvas)
  const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
  const avail = canvas.clientWidth - pad
  if (avail <= 0) return

  const minScale = userConfig.minScale ?? MermaidZoomDefaults.minScale
  const needScroll = minScale > 0 && avail < natural * minScale

  if (needScroll) {
    // 第一次改尺寸前把 mermaid 的原值存下来，之后能原样还原（max-width 是它写的 inline style，
    // 直接清空会让窄图被拉满容器）
    if (svg.dataset.acuFit !== 'natural') {
      svg.dataset.acuFit = 'natural'
      svg.dataset.acuWidth = svg.style.width
      svg.dataset.acuMaxWidth = svg.style.maxWidth
    }
    svg.style.width = `${natural}px`
    svg.style.maxWidth = 'none'
  } else if (svg.dataset.acuFit === 'natural') {
    svg.dataset.acuFit = 'fit'
    svg.style.width = svg.dataset.acuWidth ?? ''
    svg.style.maxWidth = svg.dataset.acuMaxWidth ?? ''
  }
  canvas.classList.toggle('is-scrolled', needScroll)
}

/** 记着观察这块画布（幂等）：画布重建后要重新挂 */
function observeFit(canvas: HTMLElement): void {
  const observer = ensureFitObserver()
  if (!observer || FIT_TARGETS.has(canvas)) return
  FIT_TARGETS.add(canvas)
  observer.observe(canvas)
}

/** 正文里的图表缩放下限默认值（`setMermaidConfig({ minScale })` 可覆盖，0 = 关闭） */
export const MermaidZoomDefaults = { minScale: 0.8 }

/**
 * 取出画布里的 SVG，交给全屏查看器用。
 *
 * 做两件字符串处理（都在「取出来那一刻」，不动正文里那一份）：
 *  1. 根 id 加 `-preview` 后缀 —— mermaid 的样式是按 `#<id>` 作用域注入 SVG 内部的
 *     （`<style>#acu-mmd-3 .nodeLabel{…}</style>`），所以 id 不能删，只能改名；
 *     不改的话同一份 id 会在文档里出现两次（正文 + 查看器两个拷贝），
 *     `querySelector('#id')` 之类的行为就没保证了。
 *  2. 尺寸改成自然宽高 —— 查看器里要按 100% 原始大小显示（`width="100%"` 那种
 *     跟随容器的写法在这里没有意义）。
 */
export function mermaidPreviewSvg(canvas: HTMLElement | null): string {
  const svg = canvas?.querySelector('svg')
  if (!svg) return ''
  let html = svg.outerHTML
  const id = svg.id
  if (id) html = html.split(`id="${id}"`).join(`id="${id}-preview"`).split(`#${id}`).join(`#${id}-preview`)
  const w = naturalWidthOf(svg)
  const parts = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/)
  const vbW = Number(parts[2])
  const vbH = Number(parts[3])
  if (w > 0 && vbW > 0 && vbH > 0) {
    const h = Math.round((w * vbH) / vbW)
    html = html.replace(/width="100%"/, `width="${w}" height="${h}"`)
  }
  return html
}

function fail(el: HTMLElement, err: unknown): void {
  setState(el, 'error')
  applyView(el, true)
  const hint = el.querySelector<HTMLElement>('.acu-mermaid-hint-text')
  if (hint) hint.textContent = labels().error
  const box = el.querySelector<HTMLElement>('.acu-mermaid-hint')
  // 具体报错挂在 title 上：界面上只留一句人话，排查时鼠标一悬停就能看到原文
  if (box) box.title = err instanceof Error ? err.message : String(err ?? '')
}

/**
 * 把容器里该画的图表块补渲染成 SVG。
 *
 * 幂等：已经画好且配色没过期的（`data-state="done"` + `data-mermaid-theme` 一致）直接跳过，
 * 所以可以放心在每次正文变化、主题切换、streaming 结束时重复调用。异步补渲染会检查
 * 元素是否还在文档里 —— 流式期间正文每帧重建，晚到的结果不该写进已经被替换掉的旧节点。
 *
 * @param root    正文容器（MarkdownRenderer 的根元素）
 * @param options.streaming 正文是否仍在流式输出
 */
export function renderMermaidBlocks(
  root: HTMLElement | null,
  options: MermaidHydrateOptions = {}
): void {
  if (!root || !isMermaidEnabled()) return
  const blocks = root.querySelectorAll<HTMLElement>(MERMAID_SELECTOR)
  if (!blocks.length) return
  // 流式每帧重建 DOM：把已经拆掉的画布从缩放观察名单里摘干净
  pruneFitTargets()

  const theme = resolveMermaidTheme(root)

  blocks.forEach((el) => {
    const state = el.dataset.state
    // 画不出来的图已经降级成源码了，反复重试只会反复报错
    if (state === 'error') return
    // 已画好 + 配色没过期 → 无需重画（但缩放要跟着容器/配置走，所以补一次适配 + 挂观察）
    if (state === 'done' && el.dataset.mermaidTheme === theme) {
      const canvas = el.querySelector<HTMLElement>('.acu-mermaid-canvas')
      if (canvas) {
        fitMermaidCanvas(canvas)
        observeFit(canvas)
      }
      return
    }

    const code = decodeURIComponent(el.dataset.code || '')
    if (!code) {
      fail(el, new Error('图表源码为空'))
      return
    }
    // 用户切过源码视图 → 保持源码，不再画图（换主题重建 DOM 后也要还原）
    if (sourceViewCodes.has(code)) {
      el.dataset.mermaidTheme = theme
      applyView(el, true)
      setState(el, 'done')
      return
    }
    const cached = cacheGet(`${theme}\u0000${code}`)
    if (cached !== undefined) {
      paint(el, cached, theme)
      return
    }
    if (options.streaming) {
      // 流式中不画：半截源码要么报错要么画出一张错的图
      setState(el, 'streaming')
      return
    }
    setState(el, 'rendering')
    renderMermaid(code, theme, el).then(
      (svg) => {
        if (el.isConnected) paint(el, svg, theme)
      },
      (err) => {
        if (el.isConnected) fail(el, err)
      }
    )
  })
}

/** 「源码 / 图表」切换（MarkdownRenderer 的事件委托调它） */
export function toggleMermaidSource(el: HTMLElement | null): void {
  if (!el) return
  const code = decodeURIComponent(el.dataset.code || '')
  if (!code) return
  const next = !sourceViewCodes.has(code)
  if (next) sourceViewCodes.add(code)
  else sourceViewCodes.delete(code)
  applyView(el, next)
}
