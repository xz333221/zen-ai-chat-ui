import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { resolve } from 'node:path'

// 组件库构建配置：
// - dev 模式：以根目录 index.html 为入口，加载 dev/main.ts 调试组件
// - build 模式：以 src/index.ts 为入口，Library Mode 输出 ESM + UMD + 类型声明
export default defineConfig({
  plugins: [
    vue(),
    dts({
      // 仅在 build 时生成 .d.ts
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: ['dev/**', 'src/**/*.spec.ts'],
      cleanVueFileName: true,
      copyDtsFiles: true,
      tsconfigPath: './tsconfig.app.json'
    })
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        // 全局注入 mixin（tokens.scss 只含 mixin/SCSS 变量，不输出 CSS）。
        // 用绝对路径 @use，不依赖 loadPaths，确保在任何 sass API 下可解析。
        // 函数式 additionalData 跳过 tokens.scss 自身避免循环。
        additionalData: (source: string, fp: string) => {
          const normalized = fp.replace(/\\/g, '/')
          if (normalized.endsWith('styles/tokens.scss')) return source
          const tokensPath = resolve(__dirname, 'src/styles/tokens.scss').replace(/\\/g, '/')
          return `@use "${tokensPath}" as *;\n${source}`
        }
      }
    }
  },
  server: {
    port: 7788,
    host: '127.0.0.1',
    open: false
  },
  build: {
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AiChatUi',
      formats: ['es', 'umd'],
      fileName: (format) => `ai-chat-ui.${format}.js`
    },
    rollupOptions: {
      // vue 作为 peerDependency；markdown-it / shiki 作为 dependency，
      // 均不打包进产物，由消费方安装。避免 UMD 体积爆炸（Shiki 语言 grammar）
      external: ['vue', 'markdown-it', 'shiki'],
      output: {
        globals: {
          vue: 'Vue',
          'markdown-it': 'MarkdownIt',
          shiki: 'Shiki'
        },
        exports: 'named',
        assetFileNames: (assetInfo) => {
          // 把默认的 style.css 重命名为 ai-chat-ui.css，消费方 import 'ai-chat-ui/style.css'
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'ai-chat-ui.css'
          }
          return assetInfo.name || 'asset-[name][extname]'
        }
      }
    }
  }
})
