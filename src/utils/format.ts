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
