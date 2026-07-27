#!/usr/bin/env node

const { spawn } = require("node:child_process")
const path = require("node:path")

const desktopRoot = path.resolve(__dirname, "..")
const repoRoot = path.resolve(desktopRoot, "../..")
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const pnpmEntry = process.env.npm_execpath

const workspacePackages = [
  "@eidos.space/eidos-file",
  "@eidos.space/file-space",
  "@eidos.space/extension-manifest",
  "@eidos.space/extension-installer",
  "@eidos.space/extension-state",
  "@eidos.space/extension-surface-protocol",
  "@eidos.space/extension-sdk",
  "@eidos.space/extension-runtime",
  "@eidos.space/legacy-space-migration",
  "@eidos.space/electron-ipc",
  "@eidos.space/rawdata",
  "@eidos.space/client",
]

const workspaceBuildArgs = [
  "--workspace-concurrency=6",
  ...workspacePackages.flatMap((packageName) => ["--filter", packageName]),
  "-r",
  "run",
  "build",
]

const runCommand = (command, args, cwd = repoRoot) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
    })

    child.on("error", reject)
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      const detail = signal ? `signal ${signal}` : `exit code ${code}`
      reject(new Error(`${command} ${args.join(" ")} failed with ${detail}`))
    })
  })

const runPnpm = (args) =>
  pnpmEntry
    ? runCommand(process.execPath, [pnpmEntry, ...args])
    : runCommand(pnpmCommand, args)

const prepareWorkspacePackages = async () => {
  await runPnpm(workspaceBuildArgs)
  // build:assets reads @eidos.space/client/dist, so it must follow the
  // topological workspace build instead of running alongside it.
  await runPnpm(["--filter", "@eidos.space/ext-server", "run", "build:assets"])
}

const settleParallelTasks = async (tasks) => {
  const results = await Promise.allSettled(tasks)
  const failure = results.find((result) => result.status === "rejected")

  if (failure?.status === "rejected") {
    throw failure.reason
  }
}

const prepareDesktop = async ({ withCli }) => {
  // This mutates the shared native binary, so finish it before starting builds
  // that can load workspace dependencies.
  await runPnpm(["--filter", "eidos", "run", "native:electron"])

  const tasks = [prepareWorkspacePackages()]
  if (withCli) {
    tasks.push(
      runCommand(
        process.execPath,
        [path.join("scripts", "build-cli-local.cjs")],
        desktopRoot
      )
    )
  }

  await settleParallelTasks(tasks)
}

const main = async () => {
  const args = process.argv.slice(2)
  const unknownArgs = args.filter((arg) => arg !== "--with-cli")
  if (unknownArgs.length > 0) {
    throw new Error(`Unknown arguments: ${unknownArgs.join(", ")}`)
  }

  await prepareDesktop({ withCli: args.includes("--with-cli") })
}

module.exports = {
  prepareDesktop,
  workspaceBuildArgs,
  workspacePackages,
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
