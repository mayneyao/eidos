import { spawn } from "node:child_process"
import { createRequire } from "node:module"

const require = createRequire(
  new URL("../apps/eidos-lite-desktop/package.json", import.meta.url)
)
const electronPath = require("electron")
const args = process.argv.slice(2)

if (args.length === 0) {
  throw new Error("Usage: run-electron-node.mjs <script> [...args]")
}

const child = spawn(electronPath, args, {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  stdio: "inherit",
})

child.once("error", (error) => {
  console.error(error)
  process.exitCode = 1
})
child.once("exit", (code, signal) => {
  if (code === 0) return
  console.error(`Electron Node runtime exited with ${code ?? signal}`)
  process.exitCode = code ?? 1
})
