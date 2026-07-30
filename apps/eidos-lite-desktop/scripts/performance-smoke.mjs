import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const runner = fileURLToPath(
  new URL("../../../scripts/run-electron-node.mjs", import.meta.url)
)
const child = spawn(
  process.execPath,
  [
    runner,
    "../../node_modules/vitest/vitest.mjs",
    "run",
    "--config",
    "vitest.config.ts",
    "src/main/performance-load.test.ts",
  ],
  {
    env: { ...process.env, EIDOS_LITE_RUN_PERFORMANCE: "1" },
    stdio: "inherit",
  }
)

child.once("error", (error) => {
  console.error(error)
  process.exitCode = 1
})
child.once("exit", (code, signal) => {
  if (code === 0) return
  console.error(`Performance smoke exited with ${code ?? signal}`)
  process.exitCode = 1
})
