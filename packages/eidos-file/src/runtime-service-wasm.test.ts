import { checkGroupedRuntimeSession } from "../../../tests/runtime-conformance/grouped-session"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

import { describe, expect, it } from "vitest"

import { expectConnectionPortConformance } from "./connection-port.conformance"
import { quoteIdentifier } from "./identifiers"
import { Runtime } from "./runtime-service"
import { SQLiteWasmConnectionPort } from "./sqlite-wasm"
import type { RequestContext, RuntimeEnvironment } from "./runtime-contract"

const context = (requestId: string): RequestContext => ({
  requestId,
  deadlineMilliseconds: 30_000,
})

const environment = (): RuntimeEnvironment => {
  let monotonic = 0
  let entropy = 0
  return {
    clock: {
      nowInstant: () => "2026-07-22T00:00:00.000Z",
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

describe("Eidos Runtime 1.0 WASM conformance paths", () => {
  it("groups every selected row and continues groups and rows by bound cursors", async () => {
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
      { title: "Groups" },
      {
        cancellation: {
          cancelled: () => false,
          onCancel: () => () => undefined,
        },
      }
    )
    const runtime = binding.service
    try {
      const negotiation = await runtime.negotiate(
        { protocol: "eidos-runtime", versions: ["1.0"] },
        context("negotiate")
      )
      expect(negotiation.limits.formulaBytesMax).toBe(4_096)
      expect(negotiation.capabilities.formulaPreview).toBe(true)
      await expectConnectionPortConformance(connection)
      expect(() =>
        connection.transaction("read", () =>
          connection.query(
            "INSERT INTO eidos__features(name, version, required, config_json) " +
              "VALUES ('x.test', '1.0', 0, '{}') RETURNING name"
          )
        )
      ).toThrow(/read transaction/)
      const formulaSemantics = connection.get(`SELECT
        eidos_formula_int_add(9223372036854775807, 1) AS overflow,
        eidos_formula_numeric_gt(9007199254740993, 9007199254740992.0) AS mixed,
        substr('😀ab', 2, 2) AS substring,
        length('a' || char(0) || '😀') AS scalarLength,
        date('2024-02-28', '+1 day') AS leapDay,
        strftime('%Y-%m-%dT%H:%M:%fZ',
          datetime('2026-12-31T23:00:00.000Z', '+1 hour')
        ) AS instant,
        format('%d小时%d分钟',
          floor(eidos_formula_num_div(309299, 3600)),
          round(eidos_formula_num_div(eidos_formula_int_mod(309299, 3600), 60))
        ) AS formatted,
        concat(85, '小时', 55, '分钟') AS concatenated,
        floor(1.5) AS rounded`)
      expect(formulaSemantics.row).toEqual([
        { tag: "null" },
        { tag: "integer", value: "1" },
        { tag: "text", value: "ab" },
        { tag: "integer", value: "1" },
        { tag: "text", value: "2024-02-29" },
        { tag: "text", value: "2027-01-01T00:00:00.000Z" },
        { tag: "text", value: "85小时55分钟" },
        { tag: "text", value: "85小时55分钟" },
        { tag: "real", value: 1 },
      ])
      expect(formulaSemantics.columns).toEqual([
        { name: "overflow" },
        { name: "mixed" },
        { name: "substring" },
        { name: "scalarLength" },
        { name: "leapDay" },
        { name: "instant" },
        { name: "formatted" },
        { name: "concatenated" },
        { name: "rounded" },
      ])

      const { tableId, firstItemId, fileFieldId } =
        await checkGroupedRuntimeSession(runtime, (sql) =>
          connection.execSchema(sql)
        )
      const payload = `${"AAAA".repeat(349_525)}AA==`
      const inlineEntry = await binding.hostBridge.allocateFileEntry(
        {
          name: "boundary.png",
          mediaType: "image/png",
          size: "1048576",
          uri: `data:image/png;base64,${payload}`,
        },
        context("allocate-inline-boundary")
      )
      const beforeFileMutation = await runtime.getSnapshot(
        {},
        context("snapshot-before-file")
      )
      const fileMutation = await runtime.mutateRows(
        {
          tableId,
          expectedRevision: beforeFileMutation.revision,
          changes: [
            {
              kind: "update",
              rowId: firstItemId,
              values: { [fileFieldId]: [inlineEntry] },
            },
          ],
        },
        context("mutate-inline-boundary")
      )
      const fileRows = await runtime.getRowsById(
        {
          tableId,
          rowIds: [firstItemId],
          projection: { fields: [fileFieldId], resolveRelations: [] },
        },
        context("read-inline-boundary")
      )
      expect(fileRows.revision).toBe(fileMutation.revision)
      expect(fileRows.rows[0]?.values[0]).toEqual([inlineEntry])

      const tablePhysicalName = "Items"
      const fieldPhysicalName = "Files"
      connection.transaction("write", () =>
        connection.query(
          `UPDATE ${quoteIdentifier(tablePhysicalName)} SET ${quoteIdentifier(fieldPhysicalName)} = ?1 WHERE "_id" = ?2 RETURNING "_id"`,
          [
            { tag: "text", value: "[] " },
            { tag: "text", value: firstItemId },
          ]
        )
      )
      await expect(
        runtime.getRowsById(
          {
            tableId,
            rowIds: [firstItemId],
            projection: { fields: [fileFieldId], resolveRelations: [] },
          },
          context("read-corrupt-file-value")
        )
      ).rejects.toMatchObject({ code: "corrupt-file" })
    } finally {
      await runtime.close(context("close"))
      connection.close()
    }
  }, 60_000)
})
