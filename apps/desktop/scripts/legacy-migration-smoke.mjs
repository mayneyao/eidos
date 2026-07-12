import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"

import { planLegacySpaceMigration } from "@eidos.space/legacy-space-migration"
import {
  exportLegacySpace,
  inspectLegacySpace,
} from "@eidos.space/legacy-space-migration/better-sqlite3"

const args = process.argv.slice(2)
const keep = args.includes("--keep")
const requestedId = args.find((argument) => !argument.startsWith("--"))
const batchSizeArgument = args.find((argument) =>
  argument.startsWith("--batch-size=")
)
const rowBatchSize = batchSizeArgument
  ? Number(batchSizeArgument.slice("--batch-size=".length))
  : undefined

if (!requestedId) {
  console.error(
    "Usage: pnpm --filter eidos smoke:legacy-migration <space-id> [--batch-size=2000] [--keep]"
  )
  process.exitCode = 1
} else if (
  rowBatchSize !== undefined &&
  (!Number.isInteger(rowBatchSize) || rowBatchSize < 1)
) {
  console.error("Migration smoke batch size must be a positive integer")
  process.exitCode = 1
} else {
  const registryPath = path.join(os.homedir(), ".eidos", "spaces.json")
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"))
  const space = (registry.spaces ?? []).find(
    (candidate) => candidate.id === requestedId
  )
  if (!space) {
    console.error(`Space is not registered: ${requestedId}`)
    process.exitCode = 1
  } else {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), `eidos-migration-smoke-${requestedId}-`)
    )
    const targetRoot = path.join(temporaryRoot, "Exported Space")
    try {
      const planningStartedAt = performance.now()
      const plan = planLegacySpaceMigration(inspectLegacySpace(space.path), {
        targetRoot,
      })
      const planningDurationMs = performance.now() - planningStartedAt
      if (plan.summary.errorCount > 0) {
        throw new Error(
          `Migration plan has ${plan.summary.errorCount} blocking issues`
        )
      }
      const exportStartedAt = performance.now()
      const result = await exportLegacySpace(plan, {
        rowBatchSize,
        migrationId: "smoke-test",
      })
      const exportDurationMs = performance.now() - exportStartedAt
      console.log(
        JSON.stringify(
          {
            id: space.id,
            sourceRoot: space.path,
            targetRoot: keep ? targetRoot : null,
            planningDurationMs: Math.round(planningDurationMs),
            exportDurationMs: Math.round(exportDurationMs),
            rowsPerSecond:
              exportDurationMs === 0
                ? null
                : Math.round(
                    result.exportedRowCount / (exportDurationMs / 1000)
                  ),
            summary: plan.summary,
            validation: result.validation,
          },
          null,
          2
        )
      )
    } catch (error) {
      console.error(error instanceof Error ? error.stack : String(error))
      process.exitCode = 1
    } finally {
      if (!keep) fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  }
}
