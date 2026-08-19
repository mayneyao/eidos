import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { afterAll, describe, expect, it } from "vitest"

import { createNodeSqliteHostBridge } from "./node-host"
import { runSelfTest } from "./selftest"

const directory = mkdtempSync(join(tmpdir(), "eidos-quickjs-bridge-"))

function nodeSqlitePreservesNulInScalarArguments(): boolean {
  const database = new DatabaseSync(":memory:")
  try {
    database.function("eidos_probe_length", (value) =>
      typeof value === "string" ? BigInt(Array.from(value).length) : -1n
    )
    const row = database
      .prepare("SELECT eidos_probe_length('a' || char(0) || '😀') AS value")
      .get() as { value: number | bigint }
    return Number(row.value) === 3
  } finally {
    database.close()
  }
}

const supportsQuickJsBridgeConformance =
  nodeSqlitePreservesNulInScalarArguments()

afterAll(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe("QuickJS ConnectionPort bridge (Node reference host)", () => {
  it.runIf(supportsQuickJsBridgeConformance)(
    "runs the WASM-parity self-test over node:sqlite envelopes",
    async () => {
      const path = join(directory, "selftest.eidos")
      const database = new DatabaseSync(path, {
        enableForeignKeyConstraints: true,
        readBigInts: true,
        timeout: 5_000,
      })
      ;(globalThis as Record<string, unknown>).__eidos_host =
        createNodeSqliteHostBridge(database, {
          // Node 22 does not expose DatabaseSync.serialize(); this file-backed
          // reference host is single-connection and uses delete journaling, so a
          // direct read is a consistent snapshot for the conformance test.
          serialize: () => readFileSync(path),
        })
      const report = JSON.parse(await runSelfTest()) as {
        ok: boolean
        checks?: string[]
        error?: string
        stack?: string
      }
      if (!report.ok) {
        throw new Error(`${report.error}\n${report.stack ?? ""}`)
      }
      expect(report.checks).toEqual([
        "negotiate",
        "allocate-remote-file-entry",
        "connection-port-conformance",
        "read-transaction-guard",
        "formula-scalar-semantics",
        "schema-create-table-with-formulas",
        "formula-preview",
        "invalid-formula-classification",
        "rename-lossless-rewrite",
        "mutate-rows-1002",
        "group-rows-first-page",
        "group-rows-continue-cursor",
        "group-rows-second-page",
        "target-table-rows",
        "relation-field",
        "lookup-fields",
        "lookup-evaluation-int64",
        "validate-full",
        "snapshot",
      ])
      database.close()
    },
    15_000
  )
})
