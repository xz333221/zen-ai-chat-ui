// Copyright 2026 xzisme
//
// 计划解析探针（npm run verify:plan）
//
// 为什么要有它：计划解析是**纯函数**，但错得很安静 —— in_progress 被当成 pending
// 时清单照样渲染得出来，只是永远没有"进行中"的那一行，界面上看不出任何异常。
// 所以这里把各家字段形状 / 状态词 / 截断边界全部钉成断言，跑的是真实 dist 产物
// （不是 src），顺带证明发布出去的那份能解析。
//
// 依赖：先 npm run build

import { parsePlanArgs, readPlan, isPlanTool, planProgress } from '../dist/ai-chat-ui.es.js'

const cases = [
  ['update_plan steps', { name: 'update_plan', arguments: JSON.stringify({ steps: [
    { content: 'A', status: 'completed' },
    { content: 'B', status: 'in_progress' },
    { content: 'C', status: 'pending' }
  ], explanation: '先看折叠逻辑' }) }],
  ['TodoWrite todos+activeForm', { name: 'TodoWrite', arguments: JSON.stringify({ todos: [
    { content: '读代码', status: 'completed', activeForm: '正在读代码' },
    { content: '改代码', status: 'in_progress', activeForm: '正在改 ToolCallGroup' }
  ] }) }],
  ['todo_write 数组本身', { name: 'todo_write', arguments: JSON.stringify(['甲', '乙']) }],
  ['plan.tool 变体', { name: 'plan', arguments: JSON.stringify({ plan: [{ text: 'X', state: 'done' }] }) }],
  ['read_file 不应被当成计划', { name: 'read_file', arguments: JSON.stringify({ steps: [{ content: '假步骤' }] }) }],
  ['坏 JSON', { name: 'update_plan', arguments: '{steps:[' }],
  ['空 steps', { name: 'update_plan', arguments: JSON.stringify({ steps: [] }) }],
  ['宿主已挂 plan', { name: 'whatever', plan: [{ content: '预置', status: 'pending' }] }],
  ['超长截断', { name: 'update_plan', arguments: JSON.stringify({ steps: Array.from({ length: 30 }, (_, i) => ({ content: `步骤${i}`.padEnd(250, 'x') })) }) }]
]

let fail = 0
for (const [label, call] of cases) {
  const parsed = readPlan(call)
  const n = parsed?.steps.length ?? 0
  const prog = parsed ? planProgress(parsed.steps) : null
  console.log(`${label.padEnd(26)} steps=${n} note=${parsed?.note ? 'y' : '-'} prog=${prog ? JSON.stringify(prog) : '-'}`)
  if (label === 'read_file 不应被当成计划' && n > 0) { fail++; console.log('  !! read_file 被误判成计划') }
  if (label === 'update_plan steps' && (n !== 3 || prog.done !== 1 || prog.active !== 1)) { fail++ }
  if (label === 'TodoWrite todos+activeForm' && !parsed?.steps[1].note) { fail++; console.log('  !! activeForm 没进 note') }
  if (label === '坏 JSON' && n > 0) { fail++ }
  if (label === '超长截断' && n !== 20) { fail++; console.log('  !! 没截到 20 步') }
  if (label === '空 steps' && n > 0) { fail++ }
}
console.log('isPlanTool(update_plan)=', isPlanTool('update_plan'), ' isPlanTool(updatePlan)=', isPlanTool('updatePlan'), ' isPlanTool(read_file)=', isPlanTool('read_file'))
console.log(fail === 0 ? '\nALL PASS' : `\nFAIL: ${fail}`)
process.exit(fail === 0 ? 0 : 1)
