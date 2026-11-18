import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import Database from "better-sqlite3"
import { describe, it } from "vitest"
import { BetterSqlite3ConnectionPort } from "./better-sqlite3"
import { SQLiteWasmConnectionPort } from "./sqlite-wasm"
import { expectBoundedRuntimePageReads } from "./runtime-page-read.conformance"
import { expectQueuedHostReads } from "./runtime-host-read.conformance"

describe.each([
  [
    "better-sqlite3",
    async () => new BetterSqlite3ConnectionPort(new Database(":memory:")),
  ],
  [
    "SQLite WASM",
    async () => {
      Object.defineProperty(globalThis, "self", {
        configurable: true,
        value: globalThis,
      })
      const { default: initialize } = await import("@sqlite.org/sqlite-wasm")
      const file = createRequire(import.meta.url).resolve(
        "@sqlite.org/sqlite-wasm/package.json"
      )
      const wasmBinary = await readFile(
        join(dirname(file), "sqlite-wasm/jswasm/sqlite3.wasm")
      )
      const sqlite = await initialize({
        print: () => undefined,
        printErr: () => undefined,
        wasmBinary,
      } as Parameters<typeof initialize>[0] & { wasmBinary: Uint8Array })
      return new SQLiteWasmConnectionPort(
        new sqlite.oo1.DB(":memory:", "c"),
        sqlite
      )
    },
  ],
] as const)("bounded Runtime reads in %s", (_name, create) => {
  it("preserves pages and cursors without unused totals", async () => {
    const connection = await create()
    try {
      await expectBoundedRuntimePageReads(connection)
    } finally {
      connection.close()
    }
  })
  it("keeps host reads inside the queued read lifecycle", async () => {
    const connection = await create()
    try {
      await expectQueuedHostReads(connection)
    } finally {
      connection.close()
    }
  })
})
