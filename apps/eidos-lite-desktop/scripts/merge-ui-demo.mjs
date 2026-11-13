import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { loadEnv } from "vite"

const appRoot = fileURLToPath(new URL("../", import.meta.url))
const repositoryRoot = path.resolve(appRoot, "../..")
const { values } = parseArgs({
  options: {
    output: { type: "string" },
    "create-only": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
})

if (values.help) {
  console.log(`Usage: pnpm demo:eidos-lite:merge [--output <folder>] [--create-only]

Creates a fresh five-scenario merge Demo Space and starts pnpm dev:eidos-lite.
Quit the previous development app before starting another round.
Previous rounds are retained. No account or cloud server is needed.

--output       Parent folder for runs (also EIDOS_LITE_MERGE_DEMO_ROOT).
--create-only  Generate and validate the fixture without opening the app.

Development SDK overrides are read from the same .env.development.local as Vite.`)
  process.exit(0)
}

const configured = loadEnv("development", appRoot, "EIDOS_LITE_")
const outputRoot = path.resolve(
  values.output ??
    configured.EIDOS_LITE_MERGE_DEMO_ROOT ??
    path.join(os.homedir(), "eidos-lite-demos", "merge-conflicts")
)
// Graft's fs:// remote currently accepts raw filesystem paths without whitespace.
// Check before creating any files so an unsupported location leaves no partial run.
if (/\s/u.test(outputRoot)) {
  console.error(
    "The local Graft demo remote requires a folder without whitespace. Choose another location with --output <folder>."
  )
  process.exit(1)
}
const sdkPath = configured.EIDOS_LITE_GRAFT_SDK_PATH?.trim()
const environment = { ...process.env, NODE_ENV: "development" }
if (sdkPath) environment.EIDOS_LITE_GRAFT_SDK_PATH = sdkPath
delete environment.ELECTRON_RUN_AS_NODE

async function portIsOccupied() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: 5179 })
    const finish = (occupied) => {
      socket.destroy()
      resolve(occupied)
    }
    socket.once("connect", () => finish(true))
    socket.once("error", () => finish(false))
    socket.setTimeout(1000, () => finish(true))
  })
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: environment,
      stdio: "inherit",
      ...options,
    })
    child.once("error", reject)
    child.once("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(`Command exited with ${code ?? signal}`))
    )
  })
}

if (!values["create-only"] && (await portIsOccupied())) {
  console.error(
    "Port 5179 is in use. Quit the current development app (Cmd+Q), or stop pnpm dev:eidos-lite with Ctrl+C, then start a new demo round."
  )
  process.exit(1)
}

await fs.mkdir(path.join(outputRoot, "runs"), { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const runRoot = await fs.mkdtemp(path.join(outputRoot, "runs", `${stamp}-`))
await run(
  process.execPath,
  [
    path.join(repositoryRoot, "scripts/run-electron-node.mjs"),
    "--import",
    "tsx",
    path.join(appRoot, "scripts/fixtures/merge-ui-demo.ts"),
    runRoot,
  ],
  { cwd: appRoot }
)

const local = path.join(runRoot, "Demo Space")
const profile = path.join(runRoot, "profile")
const manifest = {
  version: 1,
  createdAt: new Date().toISOString(),
  runRoot,
  local,
  profile,
  sdkPath: sdkPath ?? null,
}
await fs.writeFile(
  path.join(outputRoot, "latest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
)
await fs.writeFile(path.join(outputRoot, "CURRENT.txt"), `${local}\n`)

const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`
const sdkEnvironment = sdkPath
  ? `EIDOS_LITE_GRAFT_SDK_PATH=${shellQuote(sdkPath)} `
  : ""
const macLauncher = path.join(outputRoot, "重新开始冲突演示.command")
await fs.writeFile(
  macLauncher,
  `#!/bin/zsh\ncd ${shellQuote(repositoryRoot)} || exit 1\n${sdkEnvironment}EIDOS_LITE_MERGE_DEMO_ROOT=${shellQuote(outputRoot)} pnpm demo:eidos-lite:merge\nif [ $? -ne 0 ]; then\n  read '?按回车关闭窗口…'\nfi\n`,
  { mode: 0o755 }
)
const windowsPath = (value) => value.replaceAll("%", "%%")
await fs.writeFile(
  path.join(outputRoot, "Restart merge demo.cmd"),
  `@echo off\r\ncd /d "${windowsPath(repositoryRoot)}"\r\nset "EIDOS_LITE_MERGE_DEMO_ROOT=${windowsPath(outputRoot)}"\r\n${sdkPath ? `set "EIDOS_LITE_GRAFT_SDK_PATH=${windowsPath(sdkPath)}"\r\n` : ""}call pnpm demo:eidos-lite:merge\r\nif errorlevel 1 pause\r\n`
)
await fs.writeFile(
  path.join(outputRoot, "README.md"),
  `# 可重复的冲突演示\n\n1. 退出当前开发版（macOS 用 Cmd+Q；终端也可 Ctrl+C）。\n2. macOS 双击「重新开始冲突演示.command」；Windows 双击「Restart merge demo.cmd」。\n3. 在右侧 Sync 中选择文件，验证版本选择、撤销、手动编辑及 Complete Merge。\n\n每次运行都会生成一个新的 Demo Space 和独立配置，之前的结果留在 runs 中。无需云账号。\n\n也可在仓库根目录运行：\n\n\`\`\`sh\npnpm demo:eidos-lite:merge\n\`\`\`\n\nCURRENT.txt 指向最新一轮；latest.json 保存其路径。每轮的 SCENARIOS.md 说明五种情形，initial-state 保留合并初始状态。\n`
)

console.log(
  `\nMerge UI demo ready: ${local}\nScenarios: ${path.join(runRoot, "SCENARIOS.md")}\nPrevious rounds are retained under: ${path.join(outputRoot, "runs")}\n`
)
if (!values["create-only"]) {
  environment.EIDOS_LITE_DEV_USER_DATA = profile
  const pnpmEntry = process.env.npm_execpath
  console.log("Starting pnpm dev:eidos-lite with the isolated demo profile…")
  if (pnpmEntry && /\.(?:c|m)?js$/iu.test(pnpmEntry))
    await run(process.execPath, [pnpmEntry, "dev:eidos-lite"])
  else if (pnpmEntry && !/\.(?:cmd|bat)$/iu.test(pnpmEntry))
    await run(pnpmEntry, ["dev:eidos-lite"])
  else if (process.platform === "win32")
    await run("cmd.exe", ["/d", "/s", "/c", "pnpm dev:eidos-lite"])
  else await run("pnpm", ["dev:eidos-lite"])
}
