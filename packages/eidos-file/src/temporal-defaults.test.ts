import Database from "better-sqlite3"
import { it } from "vitest"
import { BetterSqlite3ConnectionPort } from "./better-sqlite3"
import { createTestWasmConnection } from "./sqlite-wasm-test-helper"
import { expectTemporalDefaultsConformance } from "./temporal-defaults.conformance"

it("applies temporal defaults through the WASM Runtime", async () => {
  const connection = await createTestWasmConnection()
  try {
    await expectTemporalDefaultsConformance(connection)
  } finally {
    connection.close()
  }
})

it("applies temporal defaults through the better-sqlite3 Runtime", async () => {
  const connection = new BetterSqlite3ConnectionPort(new Database(":memory:"))
  try {
    await expectTemporalDefaultsConformance(connection)
  } finally {
    connection.close()
  }
})
