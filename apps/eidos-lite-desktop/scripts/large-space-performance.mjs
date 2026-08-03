import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const sourceRoot = process.env.EIDOS_LITE_LARGE_REPOSITORY_ROOT
if (!sourceRoot) {
  console.error(
    "Set EIDOS_LITE_LARGE_REPOSITORY_ROOT to a real Space before running this performance gate."
  )
  process.exit(2)
}

const resolvedRoot = path.resolve(sourceRoot)
const stats = await fs.stat(resolvedRoot).catch(() => null)
if (!stats?.isDirectory()) {
  console.error(`Large Space fixture is not a directory: ${resolvedRoot}`)
  process.exit(2)
}

const disposableRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), "eidos-lite-large-performance-")
)
const mutationRoot = path.join(disposableRoot, "checkpoint-space")
const diffRoot = path.join(disposableRoot, "diff-space")
const mutationCopyStartedAt = performance.now()
await fs.cp(resolvedRoot, mutationRoot, {
  recursive: true,
  preserveTimestamps: true,
})
console.info(
  JSON.stringify({
    benchmark: "large-space-checkpoint-copy",
    durationMs: performance.now() - mutationCopyStartedAt,
  })
)
const diffCopyStartedAt = performance.now()
await fs.cp(resolvedRoot, diffRoot, {
  recursive: true,
  preserveTimestamps: true,
})
console.info(
  JSON.stringify({
    benchmark: "large-space-diff-copy",
    durationMs: performance.now() - diffCopyStartedAt,
  })
)

const runner = fileURLToPath(
  new URL("../../../scripts/run-electron-node.mjs", import.meta.url)
)
try {
  const outcome = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        runner,
        "../../node_modules/vitest/vitest.mjs",
        "run",
        "--config",
        "vitest.config.ts",
        "src/main/graft/large-repository.integration.test.ts",
      ],
      {
        env: {
          ...process.env,
          EIDOS_LITE_LARGE_REPOSITORY_ROOT: resolvedRoot,
          EIDOS_LITE_LARGE_REPOSITORY_MUTATION_ROOT: mutationRoot,
          EIDOS_LITE_LARGE_REPOSITORY_DIFF_ROOT: diffRoot,
        },
        stdio: "inherit",
      }
    )
    child.once("error", reject)
    child.once("exit", (code, signal) => resolve({ code, signal }))
  })
  if (outcome.code !== 0) {
    console.error(
      `Large Space performance gate exited with ${outcome.code ?? outcome.signal}`
    )
    process.exitCode = 1
  }
} finally {
  await fs.rm(disposableRoot, { recursive: true, force: true })
}
