// ============================================================
// ai-chat-ui · 主题解析
// 'auto' 需要读 prefers-color-scheme 才能定下来，而这件事只有 JS 能做
// （样式里没有 prefers-color-scheme 分支，令牌靠 [data-theme] 选择器切换）。
//
// 为什么单独拿出来：ChatContainer 的输入框被拆出去之后，宿主会在组件外
// 自己放一个 ChatInput（VSCode 式「列表页底部也有一条输入框」）。那一层
// 不在 ChatContainer 的 DOM 里，拿不到它解析好的 data-theme，只能自己解析。
// 两边各写一份 matchMedia，主题一旦不同步就是「消息区深色、输入框浅色」。
// 所以统一走这里：ChatContainer 用它，宿主也用它。
// ============================================================
import { computed, onBeforeUnmount, onMounted, ref, toValue } from 'vue'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { ThemeMode } from '@/types'

/**
 * 把 `theme` 解析成确定的 `'light' | 'dark'`。
 *
 * - 传 `'auto'`：跟随系统 `prefers-color-scheme`，系统主题变化时自动更新
 * - 传 `'light'` / `'dark'`：原样返回
 *
 * 返回值直接绑到容器上：`:data-theme="resolvedTheme"`。
 *
 * ```ts
 * const theme = ref<ThemeMode | 'auto'>('auto')
 * const resolved = useResolvedTheme(theme)      // Ref 也行
 * const resolved2 = useResolvedTheme(() => props.theme)  // getter 也行
 * ```
 *
 * @param theme 主题模式，可以是 ref / getter / 普通值
 */
export function useResolvedTheme(
  theme: MaybeRefOrGetter<ThemeMode | 'auto'>
): ComputedRef<ThemeMode> {
  const systemDark = ref(false)
  let mq: MediaQueryList | null = null

  function update(e: MediaQueryListEvent | MediaQueryList) {
    systemDark.value = e.matches
  }

  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    mq = window.matchMedia('(prefers-color-scheme: dark)')
    update(mq)
    mq.addEventListener('change', update)
  })

  onBeforeUnmount(() => {
    mq?.removeEventListener('change', update)
    mq = null
  })

  return computed<ThemeMode>(() => {
    const mode = toValue(theme)
    if (mode === 'auto') return systemDark.value ? 'dark' : 'light'
    return mode
  })
}
