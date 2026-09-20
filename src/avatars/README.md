# 内置 AI 品牌头像

给 `zen-ai-chat-ui` 提供一批「开箱即用」的知名 AI 产品头像，省去消费方自己找图、剪裁、压缩的麻烦。

所有头像都会在构建前被规范化成 **64×64、白色圆底**的 SVG data URL，并按**几何平均边长**（`sqrt(w*h)`）对齐视觉尺寸，因此不同来源的图标在气泡旁大小一致、视觉重量一致。

> 为什么要按几何平均而不是最长边：源画布的尺寸从 24 到 1024 不等，图形也未必填满画布。若统一按「最长边缩到 44px」，Claude 这种 1024×640 的宽扁 Logo 高度只剩 ~27px，一排头像里会明显比方形 Logo 小一圈。

![预览](../../docs/avatars.png)

## 用法

```vue
<script setup lang="ts">
import { ChatContainer, AI_AVATARS, resolveAvatar } from 'zen-ai-chat-ui'
import 'zen-ai-chat-ui/style.css'

const messages = [/* ... */]
</script>

<template>
  <!-- 1) 直接按键名取用 -->
  <ChatContainer :messages="messages" :assistant-avatar="AI_AVATARS.claude" />

  <!-- 2) 业务里存的是厂商字符串时，用 resolveAvatar 兜底 -->
  <!--    已知键名 -> 内置头像；未知值 -> 原样返回（当 URL / emoji 用） -->
  <ChatContainer :messages="messages" :assistant-avatar="resolveAvatar(model.provider)" />
</template>
```

`resolveAvatar` 的设计意图就是「透传」：你在数据库里存 `'claude'`、`'openai'` 这种厂商名，渲染时不用写 `if/else`，直接交给它；如果用户自己传了 `https://...png` 或 emoji，它会原样返回，不会破坏自定义头像。

## 渲染「选择头像」列表

`AI_AVATAR_PRESETS` 提供了每个头像的元信息（展示名、厂商、品牌色、来源），适合直接 `v-for` 出一个头像选择器：

```vue
<script setup lang="ts">
import { AI_AVATAR_PRESETS } from 'zen-ai-chat-ui'
</script>

<template>
  <div class="avatar-picker">
    <button
      v-for="p in AI_AVATAR_PRESETS"
      :key="p.key"
      :title="`${p.name} · ${p.vendor}`"
      @click="pick(p.key)"
    >
      <img :src="p.src" :alt="p.name" />
    </button>
  </div>
</template>
```

也可以从入口直接具名导入单个头像，便于 tree-shaking：

```ts
import { avatarClaude, avatarGemini } from 'zen-ai-chat-ui'
```

## 品牌清单

| 键名 | 展示名 | 厂商 | 品牌色 | 来源 |
| --- | --- | --- | --- | --- |
| `claude` | Claude | Anthropic | `#D97757` | Anthropic 官方标识 |
| `codex` | Codex | OpenAI | `#000000` | simple-icons |
| `kimi` | Kimi | Moonshot AI | `#000000` | Moonshot 官方标识 |
| `opencode` | OpenCode | OpenCode | `#211E1E` | iconfont |
| `zcode` | ZCode | Z.ai | `#2D2D2D` | Z.ai 官方标识 |
| `openai` | OpenAI | OpenAI | `#000000` | simple-icons |
| `gemini` | Gemini | Google | `#4285F4` | simple-icons |
| `mistral` | Mistral | Mistral AI | `#FA520F` | simple-icons |
| `copilot` | Copilot | GitHub | `#000000` | simple-icons |
| `cursor` | Cursor | Anysphere | `#000000` | simple-icons |
| `perplexity` | Perplexity | Perplexity | `#1FB8CC` | simple-icons |
| `ollama` | Ollama | Ollama | `#000000` | simple-icons |
| `huggingface` | Hugging Face | Hugging Face | `#FFD21E` | simple-icons |

## 许可

- **simple-icons 来源**（`codex`、`openai`、`gemini`、`mistral`、`copilot`、`cursor`、`perplexity`、`ollama`、`huggingface`）：[simple-icons](https://github.com/simple-icons/simple-icons) 以 **CC0 1.0 Universal** 释出，可自由使用。
- **其余品牌标识**：版权归各自所有者。此处仅用于「指代对应产品」，不构成任何背书或合作关系。
- 本项目整体以 MIT 授权；MIT 仅覆盖本仓库代码，不改变上述商标的权利归属。

> 如果某个品牌方要求下架其标识，或你想加入/替换品牌，改 `scripts/build-avatars.mjs` 里的 `BRANDS` 即可。

## 新增 / 修改品牌

源 SVG 放在 `src/avatars/svg/`，然后在 `scripts/build-avatars.mjs` 的 `BRANDS` 数组里加一条：

```js
{
  key: 'deepseek',           // 对外键名，AI_AVATARS.deepseek
  name: 'DeepSeek',          // 展示名
  vendor: 'DeepSeek',        // 厂商
  file: 'deepseek.svg',      // src/avatars/svg/ 下的源文件
  mode: 'glyph',             // 'glyph' 单色字形（按 color 重染）/ 'asis' 自带配色原样保留
  color: '#4D6BFE',          // 品牌主色
  disc: true,                // 是否铺白色圆底，保证深色 Logo 在浅色主题下也看得清
  bbox: [0, 0, 24, 24],      // 字形在源画布坐标系里的紧包围盒 [x, y, w, h]
  source: 'simple-icons'     // 来源，会写进元信息
}
```

### `bbox` 怎么量

`bbox` 是字形（而不是画布）的紧包围盒，用浏览器的 `getBBox()` 量最准。打开任意一个能跑 JS 的页面，把源 SVG 的内容包进一个 `<g>`，然后：

```js
const g = document.querySelector('#probe')   // 包住源 SVG 内容的 <g>
const b = g.getBBox()
console.log([b.x, b.y, b.width, b.height])   // 直接抄进 bbox 字段
```

量出来的值会被用来做两件事：算出缩放比例（几何平均对齐）、把包围盒中心平移到画布中心（源图形不居中也不会偏）。

**不写 `bbox` 也能跑**——脚本会退化为「按整块画布缩放 + 用 `inset`（默认 10）留边」，但图形不居中或宽高比极端时会偏。所以新品牌建议量一下。

改完重新生成：

```bash
npm run build:avatars
```

脚本会打印每个头像的字节数并合计，方便留意体积（当前 13 个约 18.8 KB）。`src/avatars/index.ts` 是**生成产物，不要手改**——它会被脚本整体覆盖。
