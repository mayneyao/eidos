import Database from "better-sqlite3"
import { it } from "vitest"
import { BetterSqlite3ConnectionPort } from "./better-sqlite3"
import { createTestWasmConnection } from "./sqlite-wasm-test-helper"
import { expectCreationDefaultsConformance } from "./creation-defaults.conformance"

it("infers ordinary-create defaults with canonical WASM query evaluation", async () => {
  const port = await createTestWasmConnection()
  try {
    await expectCreationDefaultsConformance(port)
  } finally {
    port.close()
  }
})
it("infers ordinary-create defaults with better-sqlite3 query evaluation", async () => {
  const port = new BetterSqlite3ConnectionPort(new Database(":memory:"))
  try {
    await expectCreationDefaultsConformance(port)
  } finally {
    port.close()
  }
})
