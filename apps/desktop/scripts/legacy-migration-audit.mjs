import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { planLegacySpaceMigration } from "@eidos.space/legacy-space-migration"
import { inspectLegacySpace } from "@eidos.space/legacy-space-migration/better-sqlite3"

const registryPath = path.join(os.homedir(), ".eidos", "spaces.json")
const args = process.argv.slice(2)
const includeDetails = args.includes("--details")
const requestedCodes = new Set(
  args
    .filter((argument) => argument.startsWith("--code="))
    .map((argument) => argument.slice("--code=".length))
    .filter(Boolean)
)
const requestedIds = new Set(
  args.filter((argument) => !argument.startsWith("--"))
)

function summarizeIssues(issues) {
  const counts = {}
  for (const issue of issues) {
    counts[issue.code] = (counts[issue.code] ?? 0) + 1
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  )
}

if (!fs.existsSync(registryPath)) {
  console.error(`Space registry not found: ${registryPath}`)
  process.exitCode = 1
} else {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"))
  const spaces = (registry.spaces ?? []).filter(
    (space) =>
      (space.mode ?? "legacy") !== "file" &&
      (requestedIds.size === 0 || requestedIds.has(space.id))
  )
  const results = []
  for (const space of spaces) {
    const databasePath = path.join(space.path, ".eidos", "db.sqlite3")
    if (!fs.existsSync(databasePath)) {
      results.push({
        id: space.id,
        name: space.name,
        path: space.path,
        status: "unavailable",
        error: "Legacy database is missing",
      })
      continue
    }
    try {
      const snapshot = inspectLegacySpace(space.path)
      const plan = planLegacySpaceMigration(snapshot, {
        targetRoot: path.join(os.tmpdir(), `eidos-migration-audit-${space.id}`),
      })
      const selectedIssues = plan.issues.filter(
        (issue) => requestedCodes.size === 0 || requestedCodes.has(issue.code)
      )
      results.push({
        id: space.id,
        name: space.name,
        path: space.path,
        status: plan.summary.errorCount > 0 ? "blocked" : "ready",
        summary: plan.summary,
        issueCounts: summarizeIssues(plan.issues),
        issues: selectedIssues.map((issue) => ({
          severity: issue.severity,
          code: issue.code,
          ...(includeDetails ? { message: issue.message } : {}),
          sourceId: issue.sourceId,
          sourcePath: issue.sourcePath,
        })),
      })
    } catch (error) {
      results.push({
        id: space.id,
        name: space.name,
        path: space.path,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  console.log(JSON.stringify({ registryPath, results }, null, 2))
  if (results.some((result) => result.status === "failed")) {
    process.exitCode = 1
  }
}
