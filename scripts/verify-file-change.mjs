// Copyright 2026 xzisme
//
// 文件改动解析探针（npm run verify:file-change）
//
// 为什么要有它：这块是**纯函数 + 参数解析**，错得同样安静 —— 少认一个字段名，
// 界面上就只是"这一轮没改文件"，不会报错，也没人会发现。所以把各家工具名 /
// 字段形状 / 增删计数 / 合并规则全部钉成断言，跑的是真实 dist 产物。
//
// 依赖：先 npm run build

import { readFileChange, collectFileChanges, isFileChangeTool } from '../dist/ai-chat-ui.es.js'

const tool = (name, args) => ({ id: name, name, arguments: JSON.stringify(args) })

const cases = []
let fail = 0

function check(label, actual, expected) {
  const ok = actual === expected
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(30)} ${JSON.stringify(actual)}${ok ? '' : ` (期望 ${JSON.stringify(expected)})`}`)
}

// ① 整文件写入：g ai 的 write_file
{
  const change = readFileChange(tool('write_file', { path: 'src/a.ts', content: 'line1\nline2\nline3' }))
  check('write_file.path', change?.path, 'src/a.ts')
  check('write_file.kind', change?.kind, 'write')
  check('write_file.added', change?.added, 3)
  check('write_file.removed', change?.removed, undefined)
  cases.push(['write_file', !!change])
}

// ② 精确替换：g ai 的 edit_file（3 行换 4 行，其中 2 行是新增）
{
  const change = readFileChange(tool('edit_file', {
    path: 'src/b.ts',
    old_string: 'a\nb\nc',
    new_string: 'a\nb\nB2\nc'
  }))
  check('edit_file.kind', change?.kind, 'edit')
  check('edit_file.added', change?.added, 1)
  check('edit_file.removed', change?.removed, 0)
  check('edit_file.patch has hunk', String(change?.patch).startsWith('@@'), true)
  check('edit_file.patch has +', String(change?.patch).includes('+B2'), true)
  cases.push(['edit_file', !!change])
}

// ③ Claude Code 的 Edit（字段是 file_path）+ 真删一行
{
  const change = readFileChange(tool('Edit', {
    file_path: 'D:/repo/c.ts',
    old_string: 'keep\nkill',
    new_string: 'keep'
  }))
  check('Edit.path', change?.path, 'D:/repo/c.ts')
  check('Edit.added', change?.added, 0)
  check('Edit.removed', change?.removed, 1)
  cases.push(['Edit', !!change])
}

// ④ MultiEdit：多处改动要累加
{
  const change = readFileChange(tool('MultiEdit', {
    file_path: 'd.ts',
    edits: [
      { old_string: 'x', new_string: 'x\ny' },
      { old_string: 'p\nq', new_string: 'p' }
    ]
  }))
  check('MultiEdit.added', change?.added, 1)
  check('MultiEdit.removed', change?.removed, 1)
  cases.push(['MultiEdit', !!change])
}

// ⑤ str_replace_editor：view 不是改文件，create 是写
{
  check('view 不算改动', readFileChange(tool('str_replace_editor', { command: 'view', path: 'e.ts' })), null)
  const created = readFileChange(tool('str_replace_editor', { command: 'create', path: 'e.ts', file_text: '1\n2' }))
  check('create 算写入', created?.kind, 'write')
  cases.push(['str_replace_editor', !!created])
}

// ⑥ 非写文件工具 / 坏参数 → null
check('read_file 不算改动', readFileChange(tool('read_file', { path: 'a.ts' })), null)
check('坏 JSON 不算改动', readFileChange({ id: 'x', name: 'edit_file', arguments: '{bad' }), null)
check('缺路径不算改动', readFileChange(tool('edit_file', { old_string: 'a', new_string: 'b' })), null)
check('isFileChangeTool(edit_file)', isFileChangeTool('edit_file'), true)
check('isFileChangeTool(run_command)', isFileChangeTool('run_command'), false)

// ⑦ 合并：同一文件被改两次（分隔符不同）→ 计数相加、只出现一行
{
  const changes = collectFileChanges([
    tool('write_file', { path: 'C:\\repo\\f.ts', content: '1\n2' }),
    tool('edit_file', { path: 'C:/repo/f.ts', old_string: '1', new_string: '1\n3' })
  ])
  check('merge.count', changes.length, 1)
  check('merge.added', changes[0]?.added, 3)
  check('merge.removed', changes[0]?.removed, 0)
  check('merge.keeps write hint', changes[0]?.kind, 'write')
}

console.log(`\n${fail === 0 ? '全部通过' : `${fail} 条断言失败`}（${cases.length} 组用例）`)
process.exit(fail === 0 ? 0 : 1)
