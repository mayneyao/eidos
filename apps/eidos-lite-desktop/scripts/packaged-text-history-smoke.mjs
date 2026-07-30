import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const output = path.join(appRoot, "dist-app")
const executable = path.join(
  output,
  `mac-${process.arch === "arm64" ? "arm64" : "x64"}`,
  "Eidos Lite.app",
  "Contents",
  "MacOS",
  "Eidos Lite"
)
const temporaryRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), "eidos-lite-text-history-smoke-")
)

try {
  const space = path.join(temporaryRoot, "Text History Space")
  const result = path.join(temporaryRoot, "result.json")
  await fs.mkdir(space)
  await fs.writeFile(
    path.join(space, "README.md"),
    Array.from(
      { length: 2_000 },
      (_, index) => `Before line ${String(index + 1).padStart(4, "0")}`
    ).join("\n") + "\n"
  )
  await new Promise((resolve, reject) => {
    const child = spawn(executable, [], {
      env: {
        ...process.env,
        EIDOS_LITE_SMOKE_SCOPE: "text-history",
        EIDOS_LITE_SMOKE_SPACE: space,
        EIDOS_LITE_SMOKE_RESULT: result,
        EIDOS_LITE_SMOKE_LAUNCHED_AT_MS: String(Date.now()),
      },
      stdio: "inherit",
    })
    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error("Packaged text History smoke timed out"))
    }, 30_000)
    child.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once("exit", (code, signal) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else reject(new Error(`Packaged app exited with ${code ?? signal}`))
    })
  })
  const report = JSON.parse(await fs.readFile(result, "utf8"))
  const requiredTextHistoryChecks = [
    "directRead",
    "workingDirectRead",
    "workingPierreRendered",
    "pierreRendered",
    "scrollable",
    "splitLayout",
    "unifiedLayout",
  ]
  if (
    !report.ok ||
    requiredTextHistoryChecks.some(
      (check) => report.textHistory?.[check] !== true
    ) ||
    report.consoleErrors?.length !== 0
  ) {
    throw new Error(
      `Invalid text History smoke report: ${JSON.stringify(report)}`
    )
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}
