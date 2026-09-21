// ============================================================
// ai-chat-ui · 工具函数
// ============================================================

/** 格式化文件大小 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  const fixed = value < 10 && i > 0 ? 1 : 0
  return `${value.toFixed(fixed)} ${units[i]}`
}

/** 判断是否图片类型 */
export function isImageType(type: string): boolean {
  return /^image\//i.test(type)
}

/** 生成唯一 id */
export function uid(prefix = 'acu'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 格式化耗时。
 *
 * 千分位以下不留小数位、十秒级留一位、分钟级进位——都是为了让同一列
 * 数字的宽度尽量稳定，不至于每换一条消息就抖一下。
 *
 * - `842`   → `842ms`
 * - `1234`  → `1.2s`
 * - `12500` → `12.5s`
 * - `65400` → `1m 5s`
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 10) return `${s.toFixed(1)}s`
  if (s < 60) return `${Math.round(s)}s`
  const m = Math.floor(s / 60)
  const rest = Math.round(s % 60)
  return rest ? `${m}m ${rest}s` : `${m}m`
}

/**
 * 格式化 token 数。
 * - `1234`   → `1,234`
 * - `12345`  → `1.2万`
 * - `1234567`→ `123万`
 *
 * 中文场景用「万」而不是「k / M」，四位以上数字读起来快得多。
 */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 10000) return n.toLocaleString('en-US')
  const wan = n / 10000
  return `${wan >= 100 ? Math.round(wan) : wan.toFixed(1)}万`
}

/** 格式化时钟时间（HH:MM），用于「什么时候发的」 */
export function formatClock(ts: number): string {
  if (!Number.isFinite(ts)) return ''
  const d = new Date(ts)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
