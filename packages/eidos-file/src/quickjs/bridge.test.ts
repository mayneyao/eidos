import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import Database from "better-sqlite3"
import { afterAll, describe, expect, it } from "vitest"

import { createBetterSqlite3HostBridge } from "./node-host"
import { runSelfTest } from "./selftest"

const directory = mkdtempSync(join(tmpdir(), "eidos-quickjs-bridge-"))

afterAll(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe("QuickJS ConnectionPort bridge (Node reference host)", () => {
  it("runs the WASM-parity self-test over better-sqlite3 envelopes", async () => {
    const database = new Database(join(directory, "selftest.eidos"))
    ;(globalThis as Record<string, unknown>).__eidos_host =
      createBetterSqlite3HostBridge(database)
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
  })
})
