import { spawn } from "node:child_process"

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const child = spawn(
  command,
  [
    "exec",
    "vitest",
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
