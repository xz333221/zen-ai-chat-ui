// 组件库构建入口：**先锁死 NODE_ENV=production，再加载 vite**。
//
// 为什么不能直接 `vite build`（2026-09-29 踩的坑）：
//   @vue/compiler-sfc 的 dev / prod 入口是在 require 那一刻按 NODE_ENV 选的
//   （node_modules/@vue/compiler-core/index.js 里那个 if）。而 @vitejs/plugin-vue
//   是在 vite.config.ts 被求值时 import 的 —— 只要当时 NODE_ENV 不是 production，
//   整个库的模板就用 **dev 模式**编译：
//     - 模板注释被保留 → 根节点变成 Fragment（patchFlag DEV_ROOT_FRAGMENT）
//     - 消费方用生产版 Vue 打包时，Vue 不会像 dev 版那样把 DEV_ROOT_FRAGMENT 展开成真实元素，
//       于是打在组件上的 v-show / class / 属性透传全部失效（ToolCallGroup 折叠失效就是这个）
//   npm run build 不会自带 NODE_ENV=production，本机 shell 里 NODE_ENV=development 时必中招。
//
// 所以这里用 node 脚本：先设环境变量，再 dynamic import vite —— import 是执行到才求值，
// 环境变量一定在插件（进而编译器）加载之前就位。
process.env.NODE_ENV = 'production'

const { build } = await import('vite')
await build()
