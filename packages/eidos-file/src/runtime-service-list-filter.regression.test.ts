import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

import { describe, expect, it } from "vitest"

import { Runtime } from "./runtime-service"
import { SQLiteWasmConnectionPort } from "./sqlite-wasm"
import type { RequestContext, RuntimeEnvironment } from "./runtime-contract"

const context = (requestId: string): RequestContext => ({
  requestId,
  deadlineMilliseconds: 30_000,
})

function environment(): RuntimeEnvironment {
  let monotonic = 0
  let entropy = 0
  return {
    clock: {
      nowInstant: () => "2026-07-23T00:00:00.000Z",
      nowMilliseconds: () => ++monotonic,
    },
    entropy: {
      randomBytes(length) {
        const bytes = new Uint8Array(length)
        for (let index = 0; index < length; index += 1) {
          bytes[index] = entropy++ & 0xff
        }
        return bytes
      },
    },
  }
}

describe("Runtime list-filter regression", () => {
  it("applies has-any to the public multi-select TypeRef alias", async () => {
    Object.defineProperty(globalThis, "self", {
      configurable: true,
      value: globalThis,
    })
    const { default: sqlite3InitModule } =
      await import("@sqlite.org/sqlite-wasm")
    const packageJson = createRequire(import.meta.url).resolve(
      "@sqlite.org/sqlite-wasm/package.json"
    )
    const wasmBinary = await readFile(
      join(dirname(packageJson), "sqlite-wasm/jswasm/sqlite3.wasm")
    )
    const sqlite = await sqlite3InitModule({
      print: () => undefined,
      printErr: () => undefined,
      wasmBinary,
    } as Parameters<typeof sqlite3InitModule>[0] & { wasmBinary: Uint8Array })
    const database = new sqlite.oo1.DB(":memory:", "c")
    const connection = new SQLiteWasmConnectionPort(database, sqlite)
    const binding = await Runtime.create(
      connection,
      environment(),
      { title: "List filters" },
      {
        cancellation: {
          cancelled: () => false,
          onCancel: () => () => undefined,
        },
      }
    )
    const runtime = binding.service

    try {
      const preflight = await runtime.preflightSchema(
        {
          expectedRevision: "0",
          change: {
            kind: "create-table",
            clientKey: "records",
            name: "Records",
            position: "0",
            fields: [
              {
                clientKey: "title",
                name: "Title",
                kind: "text",
                position: "0",
              },
              {
                clientKey: "signals",
                name: "Signals",
                kind: "multi-select",
                position: "1",
              },
            ],
            labelFieldClientKey: "title",
          },
        },
        context("preflight")
      )
      const schema = await runtime.mutateSchema(
        {
          expectedRevision: "0",
          planToken: preflight.planToken,
          actionsHash: preflight.actionsHash,
        },
        context("schema")
      )
      const tableId = schema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "records"
      )!.id
      const titleFieldId = schema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "title"
      )!.id
      const signalsFieldId = schema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "signals"
      )!.id

      const rows = await runtime.mutateRows(
        {
          tableId,
          expectedRevision: schema.revision,
          changes: [
            {
              kind: "create",
              clientKey: "quality",
              values: {
                [titleFieldId]: "Alpha",
                [signalsFieldId]: ["Quality", "Speed"],
              },
            },
            {
              kind: "create",
              clientKey: "cost",
              values: {
                [titleFieldId]: "Beta",
                [signalsFieldId]: ["Cost"],
              },
            },
          ],
        },
        context("rows")
      )
      const result = await runtime.queryRows(
        {
          tableId,
          query: {
            filter: {
              op: "has-any",
              fieldId: signalsFieldId,
              values: ["Quality"],
            },
          },
          projection: {
            fields: [titleFieldId, signalsFieldId],
            resolveRelations: [],
          },
          limit: 25,
          direction: "forward",
        },
        context("query")
      )

      expect(result.revision).toBe(rows.revision)
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]?.values).toEqual(["Alpha", ["Quality", "Speed"]])
    } finally {
      await runtime.close(context("close"))
      connection.close()
    }
  })
})
