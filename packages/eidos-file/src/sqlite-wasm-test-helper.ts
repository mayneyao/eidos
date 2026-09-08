import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { SQLiteWasmConnectionPort } from "./sqlite-wasm"

/** An isolated in-memory browser adapter for Runtime integration tests. */
export async function createTestWasmConnection(): Promise<SQLiteWasmConnectionPort> {
  Object.defineProperty(globalThis, "self", {
    configurable: true,
    value: globalThis,
  })
  const { default: init } = await import("@sqlite.org/sqlite-wasm")
  const packageJson = createRequire(import.meta.url).resolve(
    "@sqlite.org/sqlite-wasm/package.json"
  )
  const wasmBinary = await readFile(
    join(dirname(packageJson), "sqlite-wasm/jswasm/sqlite3.wasm")
  )
  const sqlite = await init({
    print: () => undefined,
    printErr: () => undefined,
    wasmBinary,
  } as Parameters<typeof init>[0] & { wasmBinary: Uint8Array })
  return new SQLiteWasmConnectionPort(
    new sqlite.oo1.DB(":memory:", "c"),
    sqlite
  )
}
