#!/usr/bin/env node
/**
 * 生成内置 AI 品牌头像（src/avatars/index.ts）
 *
 * 为什么要有这个脚本：品牌源 SVG 的 viewBox / 配色 / 结构各不相同
 * （iconfont 导出的 1024 方格、simple-icons 的 24 方格、官方标识的 30 方格…），
 * 直接内联会让消费方看到大小不一、深浅不一的图标。这里统一规范化成
 * 64×64、圆形底、居中留白一致的 data URL，源文件仍保留在
 * src/avatars/svg/ 便于审计与许可核查。
 *
 * 用法：npm run build:avatars
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const svgDir = path.join(rootDir, 'src', 'avatars', 'svg')
const outFile = path.join(rootDir, 'src', 'avatars', 'index.ts')

/**
 * 每个品牌的规范化参数
 *   file      源文件（src/avatars/svg/ 下）
 *   mode      'glyph' = 单色字形，会被重染成 color；'asis' = 自带配色，原样保留
 *   color     品牌主色（mode='glyph' 时的字形色，以及对外暴露的元数据）
 *   disc      是否铺一层白色底，保证深色 logo 在浅色主题下也看得清
 *   bbox      字形在源画布坐标系里的紧包围盒 [x, y, w, h]，由 getBBox() 量出
 *             （重新测量方法见 src/avatars/README.md「新增 / 修改品牌」）
 *   inset     仅当没写 bbox 时生效：按整块画布缩放时的内边距（0 = 填满）
 *
 * 为什么需要 bbox：源画布尺寸从 24 到 1024 不等，且图形未必居中、未必填满画布。
 * 只按「整块画布」缩放，宽扁的图形（如 Claude 1024×640）缩到同宽后高度会明显偏小，
 * 一排头像看上去大小不一。按紧包围盒对齐才能让每个 logo 的视觉重量接近。
 */
const BRANDS = [
  // ── 来自 zen-gitsync ──
  { key: 'claude', name: 'Claude', vendor: 'Anthropic', file: 'claude.svg', mode: 'glyph', color: '#D97757', disc: true, bbox: [0, 213.33, 1024, 640], source: 'zen-gitsync / Anthropic 官方标识' },
  { key: 'codex', name: 'Codex', vendor: 'OpenAI', file: 'codex.svg', mode: 'glyph', color: '#000000', disc: true, bbox: [0.16, 0, 23.67, 24], source: 'zen-gitsync / simple-icons' },
  { key: 'kimi', name: 'Kimi', vendor: 'Moonshot AI', file: 'kimi.svg', mode: 'asis', color: '#000000', disc: true, bbox: [0, 0, 1024, 1024], source: 'zen-gitsync / Moonshot 官方标识' },
  { key: 'opencode', name: 'OpenCode', vendor: 'OpenCode', file: 'opencode.svg', mode: 'asis', color: '#211E1E', disc: true, bbox: [102.4, 0, 819.2, 1024], source: 'zen-gitsync / iconfont' },
  { key: 'zcode', name: 'ZCode', vendor: 'Z.ai', file: 'zcode.svg', mode: 'asis', color: '#2D2D2D', disc: true, bbox: [1.49, 1.49, 27.03, 27.02], source: 'zen-gitsync / Z.ai 官方标识' },

  // ── 来自 simple-icons（CC0 1.0）──
  { key: 'openai', name: 'OpenAI', vendor: 'OpenAI', file: 'openai.svg', mode: 'glyph', color: '#000000', disc: true, bbox: [0.16, 0, 23.67, 24], source: 'simple-icons' },
  { key: 'gemini', name: 'Gemini', vendor: 'Google', file: 'gemini.svg', mode: 'glyph', color: '#4285F4', disc: true, bbox: [0, 0, 24, 24], source: 'simple-icons' },
  { key: 'mistral', name: 'Mistral', vendor: 'Mistral AI', file: 'mistral.svg', mode: 'glyph', color: '#FA520F', disc: true, bbox: [0, 3.43, 24, 17.14], source: 'simple-icons' },
  { key: 'copilot', name: 'Copilot', vendor: 'GitHub', file: 'copilot.svg', mode: 'glyph', color: '#000000', disc: true, bbox: [0, 1.98, 24, 20.04], source: 'simple-icons' },
  { key: 'cursor', name: 'Cursor', vendor: 'Anysphere', file: 'cursor.svg', mode: 'glyph', color: '#000000', disc: true, bbox: [1.47, 0, 21.06, 24], source: 'simple-icons' },
  { key: 'perplexity', name: 'Perplexity', vendor: 'Perplexity', file: 'perplexity.svg', mode: 'glyph', color: '#1FB8CC', disc: true, bbox: [1.6, 0, 20.8, 24], source: 'simple-icons' },
  { key: 'ollama', name: 'Ollama', vendor: 'Ollama', file: 'ollama.svg', mode: 'glyph', color: '#000000', disc: true, bbox: [2.92, 0, 18.16, 24], source: 'simple-icons' },
  { key: 'huggingface', name: 'Hugging Face', vendor: 'Hugging Face', file: 'huggingface.svg', mode: 'glyph', color: '#FFD21E', disc: true, bbox: [0, 1.13, 24, 21.74], source: 'simple-icons' }
]

const SIZE = 64
/** 字形视觉尺寸目标：按几何平均边长 sqrt(w*h) 对齐，而不是最长边 */
const OPTICAL = 42
/** 字形长边上限，保证圆形底上至少留 3px 内边距（否则圆角会被切掉） */
const MAX_SIDE = 58

/** 数字格式化：避免 0.039062500000001 这类浮点噪声 */
const num = (n) => Number(n.toFixed(5)).toString()

function readSource(file) {
  const abs = path.join(svgDir, file)
  if (!fs.existsSync(abs)) throw new Error(`缺少源文件: ${file}`)
  return fs.readFileSync(abs, 'utf8')
}

/** 取 <svg> 内部内容，并清掉注释与 iconfont 的无用属性 */
function extractInner(svg) {
  const m = svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i)
  if (!m) throw new Error('不是合法的 SVG')
  return m[1]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+(?:p-id|t|class|version|xmlns:xlink)="[^"]*"/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 从源 SVG 的 viewBox 推断方形画布边长（优先 viewBox，回退 width） */
function readCanvasSize(svg) {
  const vb = svg.match(/viewBox="([^"]+)"/i)
  if (vb) {
    const parts = vb[1].trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts[2] > 0) return Math.max(parts[2], parts[3])
  }
  const w = svg.match(/\swidth="([\d.]+)"/i)
  if (w) return Number(w[1])
  throw new Error('无法确定画布尺寸')
}

/** 规范化单个品牌 → data URL */
function buildBrand(brand) {
  const svg = readSource(brand.file)
  const inner = extractInner(svg)
  const canvas = readCanvasSize(svg)

  let scale, tx, ty
  if (brand.bbox) {
    const [bx, by, bw, bh] = brand.bbox
    // 按几何平均边长对齐：宽扁的图形（如 Claude 1024×640）若按最长边缩到 44px，
    // 高度只剩 ~27px，视觉重量会明显比方形 logo 轻。几何平均让「面积」接近。
    scale = OPTICAL / Math.sqrt(bw * bh)
    if (Math.max(bw, bh) * scale > MAX_SIDE) scale = MAX_SIDE / Math.max(bw, bh)
    // 把包围盒中心对齐到画布中心，而不是假设图形本来就居中
    tx = SIZE / 2 - scale * (bx + bw / 2)
    ty = SIZE / 2 - scale * (by + bh / 2)
  } else {
    // 兜底：新品牌没量 bbox 时，退化为按整块画布缩放
    const box = SIZE - (brand.inset ?? 10) * 2
    scale = box / canvas
    tx = ty = SIZE / 2 - (scale * canvas) / 2
  }
  const transform = `translate(${num(tx)} ${num(ty)}) scale(${num(scale)})`

  let body = inner
  if (brand.mode === 'glyph') {
    // 单色字形：去掉原有 fill，交给外层 <g fill="品牌色"> 统一染色
    body = body.replace(/\sfill="[^"]*"/g, '')
  }

  const disc = brand.disc ? `<rect width="${SIZE}" height="${SIZE}" fill="#ffffff"/>` : ''
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">`
    + disc
    + `<g transform="${transform}"${brand.mode === 'glyph' ? ` fill="${brand.color}"` : ''}>${body}</g>`
    + '</svg>'

  return out
}

/**
 * SVG → data URL。
 * 刻意不用 base64：URL 编码只膨胀 ~10%，base64 要 +33%。
 * 用单引号做属性引号，这样写进 TS 双引号字符串时无需转义。
 */
function toDataUrl(svg) {
  const encoded = svg
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
  return `data:image/svg+xml,${encoded}`
}

// ── 生成 ──

const built = BRANDS.map((brand) => {
  const svg = buildBrand(brand)
  return { ...brand, svg, dataUrl: toDataUrl(svg) }
})

const camel = (key) => 'avatar' + key.charAt(0).toUpperCase() + key.slice(1)

const lines = []
lines.push('// ============================================================')
lines.push('// ai-chat-ui · 内置 AI 品牌头像（由 scripts/build-avatars.mjs 生成）')
lines.push('//')
lines.push('// 请勿手改本文件 —— 改品牌清单 / 配色请编辑 scripts/build-avatars.mjs 里的')
lines.push('// BRANDS 后执行：npm run build:avatars')
lines.push('//')
lines.push('// 用法：')
lines.push('//   import { AI_AVATARS } from \'zen-ai-chat-ui\'')
lines.push('//   <ChatContainer :assistant-avatar="AI_AVATARS.claude" />')
lines.push('//')
lines.push('// 许可：simple-icons 部分为 CC0 1.0；其余为各厂商官方标识。')
lines.push('// 品牌标识归各自所有者，仅用于指代对应产品，详见 src/avatars/README.md')
lines.push('// ============================================================')
lines.push('')
lines.push('/** 内置头像键名 */')
lines.push('export type AiAvatarKey =')
for (const b of built) lines.push(`  | '${b.key}'`)
lines.push('')
lines.push('/** 内置头像元信息 */')
lines.push('export interface AiAvatarPreset {')
lines.push('  /** 键名，如 claude */')
lines.push('  key: AiAvatarKey')
lines.push('  /** 展示名，如 Claude */')
lines.push('  name: string')
lines.push('  /** 厂商，如 Anthropic */')
lines.push('  vendor: string')
lines.push('  /** 品牌主色（hex） */')
lines.push('  color: string')
lines.push('  /** 可直接喂给 assistant-avatar / user-avatar 的 data URL */')
lines.push('  src: string')
lines.push('  /** 标识来源 */')
lines.push('  source: string')
lines.push('}')
lines.push('')

for (const b of built) {
  lines.push(`/** ${b.name}（${b.vendor}）头像 data URL */`)
  lines.push(`export const ${camel(b.key)} = "${b.dataUrl}"`)
  lines.push('')
}

lines.push('/** 全部内置头像：键名 -> data URL */')
lines.push('export const AI_AVATARS = {')
for (const b of built) lines.push(`  ${b.key}: ${camel(b.key)},`)
lines.push('} as const')
lines.push('')
lines.push('/** 全部内置头像的元信息，适合用来渲染「选择头像」列表 */')
lines.push('export const AI_AVATAR_PRESETS: AiAvatarPreset[] = [')
for (const b of built) {
  lines.push('  {')
  lines.push(`    key: '${b.key}',`)
  lines.push(`    name: ${JSON.stringify(b.name)},`)
  lines.push(`    vendor: ${JSON.stringify(b.vendor)},`)
  lines.push(`    color: '${b.color}',`)
  lines.push(`    src: ${camel(b.key)},`)
  lines.push(`    source: ${JSON.stringify(b.source)},`)
  lines.push('  },')
}
lines.push(']')
lines.push('')
lines.push('/**')
lines.push(' * 把「内置头像键名」解析成 data URL；不是已知键名时原样返回。')
lines.push(' *')
lines.push(' * 典型用法：业务里存的是模型厂商名字符串，直接透传给组件：')
lines.push(' *   <ChatContainer :assistant-avatar="resolveAvatar(model.provider)" />')
lines.push(' */')
lines.push('export function resolveAvatar(value: string): string {')
lines.push('  if (!value) return value')
lines.push('  return (AI_AVATARS as Record<string, string>)[value] ?? value')
lines.push('}')
lines.push('')

fs.writeFileSync(outFile, lines.join('\n'), 'utf8')

const totalBytes = built.reduce((n, b) => n + b.dataUrl.length, 0)
console.log(`已生成 ${built.length} 个内置头像 -> src/avatars/index.ts`)
console.log(`data URL 合计 ${(totalBytes / 1024).toFixed(1)} KB`)
for (const b of built) {
  console.log(`  ${b.key.padEnd(14)} ${String(b.dataUrl.length).padStart(6)}B  ${b.name}（${b.vendor}）`)
}
