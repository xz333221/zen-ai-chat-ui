#!/usr/bin/env node
// Copyright 2026 xz333221
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * zen-ai-chat-ui 发布脚本
 *
 * 流程：
 *   1. 环境检查（git 仓库 / 分支 / 锁文件 / 工作区 / npm 登录）
 *   2. 计算并写入新版本号（package.json + package-lock.json 同步）
 *   3. 构建产物（npm run build，内含 vue-tsc 类型检查）
 *   4. 发布物自检（dist 关键文件 + npm pack 真实清单 + package.json 入口解析）
 *   5. 校验该版本在 registry 上尚未存在
 *   6. 提交并打 tag（只 stage 版本号相关文件）
 *   7. npm publish（预发布版本自动打 beta 之类的 dist-tag）
 *   8. 轮询 registry 确认版本真的可见，并检查 dist-tags 没被污染
 *
 * 用法：
 *   npm run release                          # 全流程
 *   npm run release -- --dry-run             # 只打印计划，不写文件 / 不 commit / 不 publish
 *   npm run release -- --skip-push           # 提交但不 push
 *   npm run release -- --skip-publish        # 只到提交为止，不发 npm
 *   npm run release -- --skip-build          # 跳过构建（自检会基于旧 dist，慎用）
 *   npm run release -- --yes                 # 不询问，直接用默认答案
 *   npm run release -- --version=0.1.0       # 指定版本号（默认自动递增）
 *   npm run release -- --tag=next            # 覆盖 npm dist-tag（默认按版本自动推导）
 *
 * 为什么不用 chalk：这是一发布即被消费方安装的库，devDependencies 越少越好。
 * 十几行 ANSI 辅助就够，且天然支持 NO_COLOR / 非 TTY。
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync, spawn } from 'node:child_process'
import readline from 'node:readline/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

// —— 参数解析 —— //
const argv = process.argv.slice(2)
const DRY_RUN = argv.includes('--dry-run')
const SKIP_PUSH = argv.includes('--skip-push')
const SKIP_PUBLISH = argv.includes('--skip-publish')
const SKIP_BUILD = argv.includes('--skip-build')
const ASSUME_YES = argv.includes('--yes') || argv.includes('-y')

function readStringArg(name) {
  const prefix = `${name}=`
  const hit = argv.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length).trim() : null
}

const EXPLICIT_VERSION = readStringArg('--version')
const EXPLICIT_TAG = readStringArg('--tag')

const NPM_REGISTRY = 'https://registry.npmjs.org/'
const PKG_NAME = 'zen-ai-chat-ui'
const TARBALL_BASE = NPM_REGISTRY.replace(/\/$/, '')

// —— 终端着色（零依赖）—— //
// NO_COLOR 约定 + 非 TTY 自动关闭，避免往日志里灌乱码
const COLOR_ON = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code) => (s) => (COLOR_ON ? `\u001b[${code}m${s}\u001b[0m` : String(s))
const c = {
  red: paint(31),
  green: paint(32),
  yellow: paint(33),
  blue: paint(34),
  cyan: paint(36),
  gray: paint(90)
}

/**
 * 发布物必须包含的关键文件。
 * 消费方约定：`import 'zen-ai-chat-ui/style.css'` 读的是 ai-chat-ui.css，
 * 少了它整包就等于不可用，所以逐条卡死。
 */
const EXPECTED_ARTIFACTS = [
  'dist/index.d.ts',
  'dist/ai-chat-ui.es.js',
  'dist/ai-chat-ui.umd.js',
  'dist/ai-chat-ui.css'
]

/**
 * 允许进入 release commit 的文件白名单。
 * 禁止 `git add .` —— 防止把调试残留 / 本地临时文件一起带上发布提交。
 * 功能代码应该在发版前单独提交，release commit 只承载版本号。
 */
const RELEASE_FILES = ['package.json', 'package-lock.json']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function tarballUrl(version) {
  return `${TARBALL_BASE}/${PKG_NAME}/-/${PKG_NAME}-${version}.tgz`
}

// —— 版本号 —— //

/**
 * 递增版本号。
 *   1.2.3          -> 1.2.4            （无预发布标识：递增 patch）
 *   0.1.0-beta.7   -> 0.1.0-beta.8     （预发布：递增最后一段数字）
 *   0.1.0-beta     -> 0.1.0-beta.1     （预发布无编号：补 .1）
 *
 * 想从 beta 转正式版请显式指定：--version=0.1.0
 */
function bumpVersion(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(version)
  if (!m) throw new Error(`无法解析版本号 "${version}"（期望 semver 形式，如 1.2.3 或 0.1.0-beta.7）`)
  const [, major, minor, patch, pre] = m
  // 注意 patch 是字符串：必须 Number() 再 +1，否则 '3' + 1 === '31'
  if (!pre) return `${major}.${minor}.${Number(patch) + 1}`

  const segs = pre.split('.')
  const last = segs.length - 1
  if (/^\d+$/.test(segs[last])) segs[last] = String(Number(segs[last]) + 1)
  else segs.push('1')
  return `${major}.${minor}.${patch}-${segs.join('.')}`
}

/**
 * 由版本号推导 npm dist-tag。
 * 0.1.0-beta.8 -> beta ；1.0.0 -> latest
 *
 * 必须显式传 --tag：npm 对"预发布版本"并不会自动避开 latest，
 * 不传就会把 0.1.0-beta.8 顶成 latest，让所有 `npm i zen-ai-chat-ui` 的
 * 消费方装到 beta —— 这是最典型的发包事故。
 */
function distTagFor(version) {
  const pre = version.split('-')[1]
  return pre ? pre.split('.')[0] : 'latest'
}

// —— 交互 —— //

async function askContinue(message) {
  if (ASSUME_YES) {
    console.log(c.gray(`${message}(--yes，取默认继续)`))
    return true
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await rl.question(message)).trim().toLowerCase()
    return answer === 'y' || answer === ''
  } finally {
    rl.close()
  }
}

// —— git 工具 —— //

// 记录本脚本派生出的 git 进程，用于精准 kill（绝不 `pkill -f git` 一锅端）
const spawnedGitPids = new Set()

function runGit(args, opts = {}) {
  const proc = spawn('git', args, { stdio: opts.stdio ?? 'inherit', cwd: opts.cwd ?? rootDir })
  if (proc.pid) spawnedGitPids.add(proc.pid)
  return proc
}

function terminateSpawnedGitProcesses() {
  for (const pid of spawnedGitPids) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      /* 已退出 */
    }
  }
}

/**
 * 清理遗留的 git 锁文件。
 * Windows 上 git 崩溃 / 断电后经常留下 index.lock，之后所有 git 命令都会
 * 报 "Unable to create index.lock: File exists"，而错误信息完全没提示怎么修。
 */
async function checkAndCleanGitLocks() {
  console.log(c.gray('检查 Git 锁文件...'))

  const gitDir = path.join(rootDir, '.git')
  const lockFiles = [
    path.join(gitDir, 'index.lock'),
    path.join(gitDir, 'HEAD.lock'),
    path.join(gitDir, 'config.lock'),
    path.join(gitDir, 'packed-refs.lock')
  ]
  const lockDirs = [path.join(gitDir, 'refs', 'heads'), path.join(gitDir, 'refs', 'remotes')]

  const busy = []

  for (const lockPath of lockFiles) {
    if (!fs.existsSync(lockPath)) continue
    try {
      await fsp.unlink(lockPath)
      console.log(c.green(`已删除锁文件: ${lockPath}`))
    } catch (err) {
      busy.push({ path: lockPath, err })
      console.error(c.red(`无法删除锁文件 ${lockPath}:`), err.message)
    }
  }

  for (const dir of lockDirs) {
    if (!fs.existsSync(dir)) continue
    let entries
    try {
      entries = await fsp.readdir(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (!name.endsWith('.lock')) continue
      const p = path.join(dir, name)
      try {
        await fsp.unlink(p)
        console.log(c.green(`已删除锁文件: ${p}`))
      } catch (err) {
        busy.push({ path: p, err })
        console.error(c.red(`无法删除锁文件 ${p}:`), err.message)
      }
    }
  }

  if (!busy.length) {
    console.log(c.gray('未发现 Git 锁文件'))
    return
  }

  console.log(c.yellow('锁文件被占用，尝试终止本脚本启动的 git 进程后重试...'))
  terminateSpawnedGitProcesses()
  await sleep(2000)

  for (const item of busy) {
    try {
      await fsp.unlink(item.path)
      console.log(c.green(`重试后已删除: ${item.path}`))
    } catch (err) {
      console.error(c.red(`重试仍无法删除 ${item.path}:`), err.message)
      const go = await askContinue(c.yellow('是否继续发布（可能导致失败）? (Y/n): '))
      if (!go) throw new Error('用户选择终止发布')
    }
  }
}

// —— 1. 环境检查 —— //

async function checkEnvironment() {
  console.log(c.blue('=== 1/8 检查发布环境 ==='))

  try {
    execSync('git --version', { stdio: 'ignore' })
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore', cwd: rootDir })
    await checkAndCleanGitLocks()

    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir }).toString().trim()
    console.log(c.gray(`当前 Git 分支: ${branch}`))
    if (branch !== 'main' && branch !== 'master') {
      const go = await askContinue(c.yellow(`当前不在主分支上，是否继续在 ${branch} 分支发布? (Y/n): `))
      if (!go) throw new Error('用户选择取消发布')
    }

    // 工作区必须干净：release commit 只该包含版本号，功能代码得先自行提交
    try {
      execSync('git diff --quiet && git diff --staged --quiet', { stdio: 'ignore', cwd: rootDir })
      console.log(c.green('Git 工作区干净'))
    } catch {
      console.log(c.yellow('Git 工作区有未提交的更改:'))
      execSync('git status -s', { stdio: 'inherit', cwd: rootDir })
      console.log('')
      console.log(c.yellow('提示：功能代码请先单独提交，release commit 只承载版本号。'))
      const go = await askContinue(c.yellow('仍要继续发布? (Y/n): '))
      if (!go) throw new Error('用户选择取消发布')
    }

    // npm 登录状态 —— 放在最前面，别等构建完 5 分钟才发现没登录
    try {
      const who = execSync('npm whoami', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
      console.log(c.green(`npm 已登录: ${who}`))
    } catch {
      throw new Error(`npm 未登录，请先执行：npm login --registry=${NPM_REGISTRY}`)
    }

    console.log(c.green('环境检查通过'))
  } catch (err) {
    if (err.message === '用户选择取消发布') {
      console.log(c.yellow('发布已取消'))
      process.exit(0)
    }
    console.error(c.red('环境检查失败:'), err.message || err)
    process.exit(1)
  }
}

// —— 2. 版本号 —— //

function readPackageJson() {
  return JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
}

function writePackageJson(pkg) {
  fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf8')
}

/**
 * 同步 package-lock.json 里的版本字段。
 * 本仓库 lockfile 是入库的（不像 zen-gitsync 那样忽略），不跟着改就会一直漂移，
 * 每次 install 都产生一次无意义的 diff。
 */
function syncLockfileVersion(newVersion) {
  const lockPath = path.join(rootDir, 'package-lock.json')
  if (!fs.existsSync(lockPath)) return false

  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
  let touched = false

  if (lock.version !== newVersion) {
    lock.version = newVersion
    touched = true
  }
  if (lock.packages?.[''] && lock.packages[''].version !== newVersion) {
    lock.packages[''].version = newVersion
    touched = true
  }

  if (touched) fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8')
  return touched
}

function updateVersion() {
  console.log(c.blue('\n=== 2/8 更新版本号 ==='))

  const pkg = readPackageJson()
  const currentVersion = pkg.version
  const newVersion = EXPLICIT_VERSION || bumpVersion(currentVersion)

  if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(newVersion)) {
    console.error(c.red(`版本号格式不合法: ${newVersion}`))
    process.exit(1)
  }
  if (newVersion === currentVersion) {
    console.log(c.yellow(`版本号未变化 (${currentVersion})，继续使用当前版本`))
    return { newVersion, changed: false }
  }

  if (DRY_RUN) {
    console.log(c.yellow(`[dry-run] 跳过写入: ${currentVersion} -> ${newVersion}`))
    return { newVersion, changed: true }
  }

  pkg.version = newVersion
  writePackageJson(pkg)
  const lockTouched = syncLockfileVersion(newVersion)
  console.log(c.green(`版本号已更新: ${currentVersion} -> ${newVersion}`))
  console.log(c.gray(`package-lock.json ${lockTouched ? '已同步' : '无需改动'}`))
  return { newVersion, changed: true }
}

// —— 3. 构建 —— //

async function buildLibrary() {
  console.log(c.blue('\n=== 3/8 构建产物 ==='))

  if (SKIP_BUILD) {
    console.log(c.yellow('--skip-build: 跳过构建（第 4 步会基于现有 dist 自检，注意可能是旧产物）'))
    return
  }

  const nodeModulesPath = path.join(rootDir, 'node_modules')
  if (!fs.existsSync(nodeModulesPath)) {
    console.log(c.yellow('未找到依赖，先执行 npm install...'))
    execSync('npm install', { cwd: rootDir, stdio: 'inherit' })
  }

  // 直接跑 npm run build（= vue-tsc --noEmit && vite build），
  // 不拆成两步：拆分要与 package.json 的 build 定义保持同步，容易漂移。
  //
  // 注意：**dry-run 下这一步也真跑**。dist/ 是 gitignore 掉的构建产物，
  // 写它不算"改了仓库"；而第 4 步的发布物自检必须基于真实产物才有意义
  // （跳过构建会拿上一次的旧 dist 去检，等于自欺欺人）。
  console.log(c.gray('执行 npm run build（含 vue-tsc 类型检查 + vite 打包）...'))
  try {
    execSync('npm run build', { cwd: rootDir, stdio: 'inherit' })
    console.log(c.green('构建完成'))
  } catch {
    console.error(c.red('构建失败（多半是类型错误），请修复后重新发布'))
    process.exit(1)
  }
}

// —— 4. 发布物自检 —— //

/** 把 "dist/index.d.ts" / "./dist/index.d.ts" 归一化 */
function normalizeEntry(p) {
  return String(p).replace(/^\.\//, '').replace(/\/+$/, '')
}

/** 白名单条目是否被真实打包命中（目录按前缀匹配，文件按精确匹配） */
function entryCovered(entry, packed) {
  const norm = normalizeEntry(entry)
  const prefix = norm.endsWith('/**') ? norm.slice(0, -3) : norm
  for (const p of packed) {
    if (p === prefix || p.startsWith(prefix + '/')) return true
  }
  return false
}

/** 收集 package.json 里所有对外入口（main / module / types / exports），用于验证它们真的在包里 */
function collectEntryPaths(pkg) {
  const out = new Map()
  const add = (label, value) => {
    if (typeof value === 'string' && value) out.set(normalizeEntry(value), label)
  }

  add('main', pkg.main)
  add('module', pkg.module)
  add('types', pkg.types)

  for (const [key, value] of Object.entries(pkg.exports || {})) {
    if (typeof value === 'string') {
      add(`exports["${key}"]`, value)
      continue
    }
    for (const [cond, target] of Object.entries(value || {})) {
      if (typeof target === 'string') add(`exports["${key}"].${cond}`, target)
    }
  }
  return out
}

/**
 * 发布前证明"发布物自洽"。
 *
 * 为什么必须有这一步：`files` 是**逐条列举**的白名单，本地永远复现不了缺文件
 * 的问题（本地有全部文件），只有把真实 tarball 的清单拉出来比对才发现得了。
 * 三道网，故意不合并：
 *   ① dist 关键工件存在 —— 直接读本地 dist
 *   ② 真实 `npm pack --dry-run` 清单 —— 防 .npmignore / .gitignore 反手排除
 *   ③ package.json 各入口指向的文件确实在包里 —— 防改了目录结构却漏改 exports
 */
async function verifyPackageContents() {
  console.log(c.blue('\n=== 4/8 发布物自检 ==='))

  const pkg = readPackageJson()

  // ① 本地 dist 关键工件
  const missingLocal = EXPECTED_ARTIFACTS.filter((f) => !fs.existsSync(path.join(rootDir, f)))
  if (missingLocal.length) {
    console.error(c.red('dist 缺少关键工件:\n' + missingLocal.map((f) => `  - ${f}`).join('\n')))
    console.error(c.gray('vite.config.ts 的 lib.fileName / assetFileNames 是否被改动过？'))
    process.exit(1)
  }
  console.log(c.green(`① dist 关键工件齐全（${EXPECTED_ARTIFACTS.length} 个）`))

  // ② 真实 npm pack（不落盘、不联网）
  let packJson
  try {
    const out = execSync('npm pack --dry-run --json', { cwd: rootDir, encoding: 'utf8' })
    // npm 有时会在前后混入提示行，取第一个 '[' 到最后一个 ']'
    packJson = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1))
  } catch (err) {
    console.error(c.red('npm pack --dry-run 失败:'), err.message || err)
    process.exit(1)
  }

  const packed = new Set((packJson[0]?.files || []).map((f) => f.path))
  if (packed.size === 0) {
    console.error(c.red('npm pack 打出了空包，绝对有问题'))
    process.exit(1)
  }

  const notPacked = (pkg.files || []).filter((entry) => !entryCovered(entry, packed))
  if (notPacked.length) {
    console.error(
      c.red(
        `有 ${notPacked.length} 条 files 白名单没真正进包（大概率被 .npmignore / .gitignore 排除）:\n`
          + notPacked.map((e) => `  - ${e}`).join('\n')
      )
    )
    process.exit(1)
  }

  const missingArtifacts = EXPECTED_ARTIFACTS.filter((f) => !packed.has(f))
  if (missingArtifacts.length) {
    console.error(
      c.red('关键工件没进 tarball:\n' + missingArtifacts.map((f) => `  - ${f}`).join('\n'))
    )
    process.exit(1)
  }
  console.log(c.green(`② 真实打包 ${packed.size} 个文件，files 白名单与关键工件逐条命中`))

  // ③ package.json 入口指向的文件必须真的在包里
  const broken = []
  for (const [target, label] of collectEntryPaths(pkg)) {
    if (!packed.has(target)) broken.push(`${label} -> ${target}`)
  }
  if (broken.length) {
    console.error(
      c.red('package.json 的入口指向了包里不存在的文件:\n' + broken.map((b) => `  - ${b}`).join('\n'))
      + '\n消费方 import 时会直接模块解析失败。'
    )
    process.exit(1)
  }
  console.log(c.green(`③ ${collectEntryPaths(pkg).size} 个对外入口均指向已打包文件`))
}

// —— 5. 版本占用检查 —— //

/** registry 上读某版本的版本号；不存在/查询失败返回 null */
function readPublishedVersion(version) {
  try {
    const out = execSync(
      `npm view ${PKG_NAME}@${version} version --json --registry=${NPM_REGISTRY} --prefer-online`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }
    )
    const parsed = JSON.parse(out.trim())
    return typeof parsed === 'string' ? parsed : null
  } catch {
    return null
  }
}

/** 读 registry 上的 dist-tags；失败返回 null */
function readDistTags() {
  try {
    const out = execSync(`npm view ${PKG_NAME} dist-tags --json --registry=${NPM_REGISTRY} --prefer-online`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000
    })
    return JSON.parse(out.trim())
  } catch {
    return null
  }
}

function ensureVersionAvailable(version) {
  console.log(c.blue('\n=== 5/8 校验版本可用性 ==='))

  if (DRY_RUN) {
    console.log(c.yellow(`[dry-run] 跳过 registry 占用检查（${version}）`))
    return
  }

  const existing = readPublishedVersion(version)
  if (existing) {
    console.error(c.red(`registry 上已存在 ${PKG_NAME}@${existing}，无法重复发布。`))
    console.error(c.gray('换一个版本号，或先执行 npm deprecate / npm unpublish（unpublish 慎用）。'))
    process.exit(1)
  }
  console.log(c.green(`${version} 在 registry 上尚未占用`))
}

// —— 6. 提交 —— //

function stageReleaseFiles() {
  console.log(c.gray('stage 白名单文件（避免 git add . 误带脏文件）...'))
  for (const f of RELEASE_FILES) {
    const abs = path.join(rootDir, f)
    if (!fs.existsSync(abs)) continue
    if (DRY_RUN) {
      console.log(c.yellow(`[dry-run] git add ${f}`))
    } else {
      execSync(`git add ${JSON.stringify(f)}`, { stdio: 'inherit', cwd: rootDir })
    }
  }

  if (DRY_RUN) return

  const staged = execSync('git diff --cached --name-only', {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'inherit']
  })
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean)

  const unexpected = staged.filter((f) => !RELEASE_FILES.includes(f))
  if (unexpected.length) {
    console.error(c.red('staged 范围超出白名单，中止提交:'))
    for (const f of unexpected) console.error('  - ' + f)
    process.exit(1)
  }
}

async function commitChanges(version) {
  console.log(c.blue('\n=== 6/8 提交并打 tag ==='))

  try {
    await checkAndCleanGitLocks()
    stageReleaseFiles()

    const message = `chore(release): ${version}`

    if (DRY_RUN) {
      console.log(c.yellow(`[dry-run] git commit -m "${message}"`))
      console.log(c.yellow(`[dry-run] git tag v${version}`))
    } else {
      execSync(`git commit -m ${JSON.stringify(message)}`, { stdio: 'inherit', cwd: rootDir })
      console.log(c.green(`已提交: "${message}"`))

      try {
        execSync(`git tag v${version}`, { stdio: 'inherit', cwd: rootDir })
        console.log(c.green(`已创建标签: v${version}`))
      } catch {
        // tag 已存在不该阻塞发布
        console.log(c.yellow(`标签 v${version} 可能已存在，跳过`))
      }
    }

    if (SKIP_PUSH) {
      console.log(c.yellow('--skip-push: 跳过 git push'))
      return
    }

    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir }).toString().trim()
    if (DRY_RUN) {
      console.log(c.yellow(`[dry-run] git push origin ${branch}`))
      console.log(c.yellow(`[dry-run] git push origin --tags`))
      return
    }

    try {
      console.log(c.gray(`推送代码到远程仓库，分支: ${branch}...`))
      execSync(`git push origin ${branch}`, { stdio: 'inherit', cwd: rootDir })
      console.log(c.gray('推送标签到远程仓库...'))
      execSync('git push origin --tags', { stdio: 'inherit', cwd: rootDir })
      console.log(c.green('代码和标签已推送到远程仓库'))
    } catch (err) {
      // 推送失败不阻塞 npm 发布：网络问题不该把已构建好的版本卡住
      console.error(c.red('推送到远程仓库失败:'), err.message)
      console.error(c.gray('（不阻塞 npm 发布，可稍后手动 git push）'))
    }
  } catch (err) {
    console.error(c.red('Git 提交失败:'), err.message || err)
    process.exit(1)
  }
}

// —— 7. 发布 —— //

function publishToNpm(version) {
  console.log(c.blue('\n=== 7/8 发布到 NPM ==='))

  const tag = EXPLICIT_TAG || distTagFor(version)
  const cmd = `npm publish --tag ${tag} --registry=${NPM_REGISTRY}`

  if (tag === 'latest' && version.includes('-')) {
    console.warn(c.yellow(`注意：版本 ${version} 带预发布标识，却要发到 latest 标签。`))
  }

  if (SKIP_PUBLISH) {
    console.log(c.yellow('--skip-publish: 跳过 npm publish'))
    console.log(c.gray(`手动发布命令: ${cmd}`))
    return tag
  }

  if (DRY_RUN) {
    console.log(c.yellow(`[dry-run] ${cmd}`))
    return tag
  }

  console.log(c.gray(`执行 ${cmd}`))
  try {
    execSync(cmd, { cwd: rootDir, stdio: 'inherit' })
    console.log(c.green(`已发布 ${PKG_NAME}@${version}（dist-tag: ${tag}）`))
  } catch (err) {
    console.error(c.red('发布到 NPM 失败:'), err.message || err)
    process.exit(1)
  }
  return tag
}

// —— 8. 发布后校验 —— //

/**
 * publish 返回成功 ≠ registry 立即可见。
 * npm 会返回 "Your package is being processed"，且 packument 带 CDN 缓存
 * （Cache-Control: public, max-age=300）—— 光 CDN 层就可能滞后 5 分钟。
 * 所以这里轮询确认，顺带查 dist-tags 有没有被预发布版本污染。
 */
async function verifyPublished(version, tag) {
  console.log(c.blue('\n=== 8/8 校验发布结果 ==='))

  if (SKIP_PUBLISH || DRY_RUN) {
    console.log(c.yellow('已跳过发布，无需校验'))
    return
  }

  const timeoutMs = 300000
  const intervalMs = 10000
  const deadline = Date.now() + timeoutMs
  const started = Date.now()
  let attempt = 0

  for (;;) {
    attempt += 1
    if (readPublishedVersion(version) === version) {
      const cost = ((Date.now() - started) / 1000).toFixed(1)
      console.log(c.green(`registry 已可见 ${PKG_NAME}@${version}（第 ${attempt} 次查询，耗时 ${cost}s）`))

      const tags = readDistTags()
      if (tags) {
        console.log(c.gray(`当前 dist-tags: ${JSON.stringify(tags)}`))
        if (tag !== 'latest' && tags.latest === version) {
          console.error(
            c.red(`⚠ 「${version}」是预发布版本，却被顶成了 latest 标签！`)
              + '\n消费方 `npm i ' + PKG_NAME + '` 会装到它。建议立刻纠正：'
              + `\n  npm dist-tag add ${PKG_NAME}@<上一个正式版> latest`
          )
        } else if (tags[tag] === version) {
          console.log(c.green(`dist-tag「${tag}」指向正确`))
        }
      }
      return
    }

    const remain = deadline - Date.now()
    if (remain <= 0) {
      console.error(c.red(`已等待 ${timeoutMs / 1000}s，registry 仍未列出 ${version}`))
      console.error(c.gray(
        '通常是 CDN 缓存滞后（max-age=300），稍后自行确认：\n'
          + `  npm view ${PKG_NAME}@${version} version\n`
          + `  npm view ${PKG_NAME} dist-tags`
      ))
      return
    }
    console.log(c.gray(`本次不可见，${Math.ceil(remain / 1000)}s 后重试...`))
    await sleep(Math.min(intervalMs, remain))
  }
}

// —— 主流程 —— //

async function main() {
  console.log(c.cyan(`\n🚀 ${PKG_NAME} 发布流程${DRY_RUN ? '（DRY RUN）' : ''}\n`))

  if (DRY_RUN) {
    console.log(c.yellow('--dry-run: 所有写操作跳过，只打印计划'))
    console.log(c.yellow('--dry-run: npm run build 与 npm pack --dry-run 仍会真跑（发布物自检必须基于真实产物）'))
  }
  if (SKIP_BUILD) console.log(c.yellow('--skip-build: 跳过构建，第 4 步基于现有 dist 自检'))
  if (SKIP_PUSH) console.log(c.yellow('--skip-push: 不 push git'))
  if (SKIP_PUBLISH) console.log(c.yellow('--skip-publish: 不发 npm'))
  if (EXPLICIT_VERSION) console.log(c.yellow(`--version: 指定版本 ${EXPLICIT_VERSION}`))
  if (EXPLICIT_TAG) console.log(c.yellow(`--tag: 指定 dist-tag ${EXPLICIT_TAG}`))
  console.log('')

  await checkEnvironment()

  const { newVersion } = updateVersion()
  await buildLibrary()
  await verifyPackageContents()
  ensureVersionAvailable(newVersion)
  await commitChanges(newVersion)
  const tag = publishToNpm(newVersion)
  await verifyPublished(newVersion, tag)

  console.log(c.green(`\n🎉 完成：${PKG_NAME}@${newVersion}（dist-tag: ${tag}）`))
  if (tag !== 'latest') {
    console.log(c.gray(`消费方安装：npm i ${PKG_NAME}@${tag}  或  npm i ${PKG_NAME}@${newVersion}`))
  }
  console.log(c.gray(`tarball 直链（packument 缓存未刷新时可直连）：${tarballUrl(newVersion)}`))
}

main().catch((err) => {
  console.error(c.red('\n❌ 未捕获的错误:'), err)
  process.exit(1)
})
