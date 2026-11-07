// Copyright 2026 xzisme
//
// diff 解析 / 高亮探针（npm run verify:diff）
//
// 为什么要有它：抽屉里画 diff 全靠「patch 文本 → 行模型」这一步，错了同样安静 ——
// 行号错位、`+` 行当成上下文、整文件写入的省略说明被当成代码，界面上只是「看着怪」。
// 所以把行号推进、行类型、语言推断、高亮输出全部钉成断言，跑的是真实 dist 产物。
//
// 依赖：先 npm run build

import {
  parseUnifiedDiff,
  diffLanguage,
  splitFilePath,
  highlightDiff
} from '../dist/ai-chat-ui.es.js'

let fail = 0

function check(label, actual, expected) {
  const ok = typeof expected === 'object'
    ? JSON.stringify(actual) === JSON.stringify(expected)
    : actual === expected
  if (!ok) fail++
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(34)} ${JSON.stringify(actual)}` +
      (ok ? '' : ` (期望 ${JSON.stringify(expected)})`)
  )
}

// ① 标准 unified diff：hunk 头 + 上下文 + 增删，行号按旧/新两列各自推进
{
  const rows = parseUnifiedDiff(
    ['@@ -10,3 +10,4 @@', ' keep', '-old', '+new', '+extra', ' tail'].join('\n')
  )
  check('hunk 行数', rows.length, 6)
  check('hunk 头类型', rows[0].type, 'hunk')
  check('hunk 头不占行号', [rows[0].oldNo, rows[0].newNo], [null, null])
  check('context 行号', [rows[1].oldNo, rows[1].newNo], [10, 10])
  check('del 行号', [rows[2].oldNo, rows[2].newNo], [11, null])
  check('add 行号（紧跟删除）', [rows[3].oldNo, rows[3].newNo], [null, 11])
  check('add 行号（第二行）', [rows[4].oldNo, rows[4].newNo], [null, 12])
  check('尾部 context 行号', [rows[5].oldNo, rows[5].newNo], [12, 13])
  check('文本去掉了前缀', rows[2].text, 'old')
  check('符号保留', rows[3].sign, '+')
}

// ② 整文件写入：没有 @@ 头，只有一串 `+`，行号从 1 开始（不是 0）
{
  const rows = parseUnifiedDiff(['+line1', '+line2', '+line3'].join('\n'))
  check('write 行号', rows.map((r) => r.newNo), [1, 2, 3])
  check('write 全是 add', rows.every((r) => r.type === 'add'), true)
}

// ③ 省略说明 / git 元信息：不参与高亮，也不占行号
{
  const rows = parseUnifiedDiff(
    ['+a', '…（文件其余部分已省略）', 'diff --git a/x b/x', 'index 111..222', '--- a/x', '+++ b/x'].join('\n')
  )
  check('只保留代码行 + 说明', rows.map((r) => r.type), ['add', 'note'])
  check('说明行没有行号', [rows[1].oldNo, rows[1].newNo], [null, null])
}

// ④ 空 patch / 只有空白 → 没有行（组件据此显示「无可预览的差异」）
check('空 patch', parseUnifiedDiff('').length, 0)
check('undefined patch', parseUnifiedDiff(undefined).length, 0)

// ⑤ 语言推断 & 路径拆分
check('vue 语言', diffLanguage('src/components/App.vue'), 'vue')
check('ts 语言', diffLanguage('C:\\repo\\src\\a.ts'), 'typescript')
check('无扩展名', diffLanguage('Makefile'), 'makefile')
check('认不出', diffLanguage('a.unknownext'), null)
check('路径拆分', splitFilePath('D:\\repo\\src\\a.ts'), { dir: 'D:/repo/src/', base: 'a.ts' })

// ⑥ 高亮：每行一段 HTML，颜色走双主题变量，内容已转义
{
  const lines = await highlightDiff('const a = "<b>"\nlet b = 1', 'typescript')
  check('高亮行数', Array.isArray(lines) && lines.length, 2)
  const joined = (lines || []).join('')
  check('双主题变量', joined.includes('--shiki-light') && joined.includes('--shiki-dark'), true)
  check('尖括号已转义', joined.includes('&quot;') && joined.includes('&lt;b&gt;'), true)
  check('未知语言降级', await highlightDiff('whatever', 'not-a-real-lang'), null)
}

console.log(`\n${fail === 0 ? '全部通过' : `${fail} 条断言失败`}`)
process.exit(fail === 0 ? 0 : 1)
