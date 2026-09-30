// Copyright 2026 xzisme
//
// 图表渲染探针（npm run verify:mermaid）
//
// 为什么要有它：```mermaid 的降级是**静默**的 —— fence 一旦不再把 mermaid 认成图表，
// 正文照样渲染得出来，只是流程图悄悄变回一坨源码，界面上没有任何报错。而「画成图」
// 那一步要 mermaid 本体 + 浏览器，纯 node 跑不了。所以这里钉住的是**契约**：
//   1. ```mermaid 必须产出图表占位块，而不是普通代码块
//   2. 占位块里的源码要能原样取回（补渲染与复制按钮都只认 data-code）
//   3. 源码里的尖括号 / 引号不能漏进 HTML（data 属性与 <pre> 两处都是注入面）
//   4. 关掉图表后要退回普通代码块（源码仍可见，不是消失）
//   5. 类型标题按源码首个关键字判断（跳过 front-matter 与 %% 注释）
//
// 依赖：先 npm run build

import {
  setMermaidConfig,
  mermaidTypeLabel,
  mermaidLabels,
  useMarkdown,
  MERMAID_TYPE_NAMES
} from '../dist/ai-chat-ui.es.js'

const { render } = useMarkdown()

let fail = 0
const check = (label, ok, extra = '') => {
  console.log(`${ok ? '  ok  ' : '  !!  '} ${label}${extra ? `  ${extra}` : ''}`)
  if (!ok) fail++
}

/** 从占位块里取回源码（和浏览器端 decodeURIComponent(el.dataset.code) 同一条路） */
function readCode(html) {
  const m = html.match(/class="acu-mermaid"[^>]*data-code="([^"]*)"/)
  return m ? decodeURIComponent(m[1]) : null
}

// —— 1. ```mermaid 走图表链路 ——
const chart = render('```mermaid\ngraph TD\n  A[开始] --> B[结束]\n```')
check('mermaid 代码块产出图表占位块', chart.includes('class="acu-mermaid"'))
check('mermaid 代码块不再是普通代码块', !chart.includes('acu-code-block'))
check('占位块带上了源码', readCode(chart)?.trimEnd() === 'graph TD\n  A[开始] --> B[结束]')
check('占位块默认是 pending / chart 态', /data-state="pending"/.test(chart) && /data-view="chart"/.test(chart))
check('占位块里有画布容器', chart.includes('class="acu-mermaid-canvas"'))
check('占位块标题按关键字给出类型', chart.includes('>流程图<'), chart.match(/acu-mermaid-type">([^<]*)</)?.[1])

// —— 2. ```mmd 老缩写也认 ——
const mmd = render('```mmd\nsequenceDiagram\n  A->>B: hi\n```')
check('```mmd 同样走图表链路', mmd.includes('class="acu-mermaid"') && mmd.includes('>时序图<'))

// —— 3. 普通代码块不受影响 ——
const code = render('```js\nconst a = 1\n```')
check('普通代码块仍是代码块', code.includes('acu-code-block') && !code.includes('acu-mermaid'))

// —— 4. 注入面：源码里的标签与引号 ——
// 注意 markdown-it 的 fence content 含结尾换行，所以比的是 trimEnd 后的原文：
// 关键是「原样取回」，多一个换行不影响 mermaid 解析（复制按钮拿到的也是这份）
const evil = 'graph TD\n  A["<img src=x onerror=alert(1)>"] --> B["><script>"]'
const evilHtml = render('```mermaid\n' + evil + '\n```')
check('源码里的尖括号没漏进 HTML', !/<img|<script/i.test(evilHtml))
check('引号没截断 data-code 属性', readCode(evilHtml)?.trimEnd() === evil, readCode(evilHtml)?.slice(0, 40))

// —— 5. 关掉图表 → 退回普通代码块，但源码还在 ——
setMermaidConfig({ enabled: false })
const off = render('```mermaid\ngraph TD\n  A --> B\n```')
check('关掉后不再是占位块', !off.includes('acu-mermaid'))
check('关掉后源码仍以代码块呈现', off.includes('acu-code-block') && off.includes('graph TD'))
setMermaidConfig({ enabled: true })
check('重新打开后恢复占位块', render('```mermaid\ngraph TD\n A-->B\n```').includes('acu-mermaid'))

// —— 6. 类型判断 ——
const typeCases = [
  ['flowchart LR\n A-->B', '流程图'],
  ['graph TD\n A-->B', '流程图'],
  ['sequenceDiagram\n A->>B: x', '时序图'],
  ['classDiagram\n A <|-- B', '类图'],
  ['stateDiagram-v2\n [*] --> A', '状态图'],
  ['erDiagram\n A ||--o{ B : x', 'ER 图'],
  ['gantt\n title X', '甘特图'],
  ['pie title X\n "a": 1', '饼图'],
  ['mindmap\n root((x))', '思维导图'],
  ['%% 这是注释\nflowchart TD\n A-->B', '流程图'],
  ['---\ntitle: 带 front-matter\ntheme: base\n---\nflowchart TD\n A-->B', '流程图'],
  ['这根本不是图', '图表']
]
for (const [src, want] of typeCases) {
  const got = mermaidTypeLabel(src)
  check(`类型「${src.split('\n')[0]}」→ ${want}`, got === want, got === want ? '' : `实际 ${got}`)
}

// —— 7. 文案可覆盖 ——
check('默认文案是中文', mermaidLabels().source === '源码' && mermaidLabels().error.includes('图表'))
setMermaidConfig({ labels: { source: 'Code', error: 'Diagram failed' } })
check('labels 覆盖生效', mermaidLabels().source === 'Code' && mermaidLabels().error === 'Diagram failed')
check('覆盖后的文案进了 fence 输出', render('```mermaid\ngraph TD\n A-->B\n```').includes('>Code<'))
setMermaidConfig({ labels: { source: '源码', error: '图表渲染失败，已显示源码' } })

check('类型表覆盖常见图型', Object.keys(MERMAID_TYPE_NAMES).length >= 20)

console.log(fail === 0 ? '\nALL PASS' : `\nFAIL: ${fail}`)
process.exit(fail === 0 ? 0 : 1)
