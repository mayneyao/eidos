// @vitest-environment node
import { expect, it } from "vitest"
import {
  Runtime,
  EidosFileRuntime,
  ConnectionPortEidosFileConnection,
  quoteIdentifier,
} from "@eidos.space/eidos-file"
import { createTestWasmConnection } from "../../eidos-file/src/sqlite-wasm-test-helper"
import { EidosRuntimeEditorDataSource } from "./runtime-editor-data-source"

it("delegates canonical Datetime positions to Runtime and preserves explicit precision guards", async () => {
  const port = await createTestWasmConnection()
  const { service } = await Runtime.create(
    port,
    {
      clock: {
        nowInstant: () => "2026-11-16T00:00:00.000Z",
        nowMilliseconds: () => performance.now(),
      },
      entropy: {
        randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
      },
    },
    { title: "Row positions" },
    {
      cancellation: { cancelled: () => false, onCancel: () => () => undefined },
    }
  )
  const source = new EidosRuntimeEditorDataSource(service, "positions.eidos")
  try {
    await source.initialize()
    const snapshot = await source.createTable({
      name: "Events",
      fields: [
        { name: "Title", type: "text" },
        { name: "When", type: "datetime" },
      ],
    })
    const table = snapshot.tables[0]!,
      when = table.fields.find((f) => f.name === "When")!
    for (const value of [
      null,
      "2026-11-16T00:00:00.123Z",
      "2026-11-16T00:00:00.123Z",
      "2026-11-16T00:00:00.124Z",
    ])
      await source.insertRow(table.table.id, { [when.id]: value })
    for (const direction of ["asc", "desc"] as const)
      for (const nulls of ["first", "last"] as const) {
        const query = { sorts: [{ field: when.id, direction, nulls }] }
        const page = await source.getPage(table.table.id, 0, 20, query)
        const ids = page.rows.map((row) => String(row._id))
        for (const [index, rowId] of ids.entries()) {
          expect(await source.getRowIndex(table.table.id, rowId, query)).toBe(
            index
          )
          expect(
            await service.getRowIndex!(
              {
                tableId: table.table.id,
                rowId,
                query: { sort: [{ fieldId: when.id, direction, nulls }] },
              },
              { requestId: `position-${direction}-${nulls}-${index}` }
            )
          ).toBe(String(index))
        }
      }
    for (const filter of [
      { op: "calendar-period", fieldId: when.id, unit: "day", offset: 0 },
      {
        op: "calendar-window",
        fieldId: when.id,
        unit: "week",
        direction: "past",
        count: 1,
      },
    ] as const) {
      const request = {
        tableId: table.table.id,
        calendar: {
          timeZone: "UTC",
          timeZoneData: "2026f",
          weekStartsOn: 1 as const,
        },
        referenceInstant: "2026-11-16T00:00:00.000Z",
        query: {
          filter,
          sort: [{ fieldId: when.id, direction: "asc" as const }],
        },
      }
      const page = await service.queryRows(
        {
          ...request,
          projection: { fields: [when.id], resolveRelations: [] },
          limit: 20,
        },
        { requestId: `calendar-rank-rows-${filter.op}` }
      )
      expect(page.rows).toHaveLength(3)
      for (const [index, row] of page.rows.entries())
        expect(
          await service.getRowIndex!(
            { ...request, rowId: row.id },
            { requestId: `calendar-rank-${filter.op}-${index}` }
          )
        ).toBe(String(index))
    }
    await expect(
      source.insertRow(table.table.id, {
        [when.id]: "2026-11-16T00:00:00.123456Z",
      })
    ).rejects.toMatchObject({ code: "invalid-value" })
    const target = (await source.getPage(table.table.id, 0, 1, {})).rows[0]!
    await expect(
      service.getRowIndex!(
        {
          tableId: table.table.id,
          rowId: String(target._id),
          query: {
            filter: {
              op: "gt",
              fieldId: when.id,
              value: "2026-11-16T00:00:00.123456Z",
            },
          },
        },
        { requestId: "explicit-high-precision-filter" }
      )
    ).rejects.toMatchObject({ code: "invalid-value" })
    await expect(
      service.getRowIndex!(
        {
          tableId: table.table.id,
          rowId: String(target._id),
          query: {
            filter: { op: "future-date-query", fieldId: when.id },
          } as unknown as Parameters<
            NonNullable<typeof service.getRowIndex>
          >[0]["query"],
        },
        { requestId: "unknown-query" }
      )
    ).rejects.toBeDefined()

    const readBinding = await Runtime.open(
      port,
      {
        clock: {
          nowInstant: () => "2026-11-16T00:00:00.000Z",
          nowMilliseconds: () => performance.now(),
        },
        entropy: {
          randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
        },
      },
      "read",
      {
        cancellation: {
          cancelled: () => false,
          onCancel: () => () => undefined,
        },
      }
    )
    const readSource = new EidosRuntimeEditorDataSource(
      readBinding.service,
      "readonly.eidos"
    )
    const readSnapshot = await readSource.initialize()
    expect(
      readSnapshot.tables[0]!.fields.every((field) => field.writable === false)
    ).toBe(true)
    expect(readSnapshot.tables[0]!.table.settings?.capabilities).toMatchObject({
      insert: false,
      update: false,
      delete: false,
      alterSchema: false,
    })
    await expect(readSource.insertRow(table.table.id, {})).rejects.toBeDefined()

    // An external virtual source may expose precise values that cannot be
    // submitted as public Datetime literals. Exercise its SQL function in WASM.
    const physicalTable = port.get("SELECT physical_name FROM eidos__tables")
      .row?.[0]
    const physicalField = port.get(
      "SELECT physical_name FROM eidos__fields WHERE name = 'When'"
    ).row?.[0]
    if (physicalTable?.tag !== "text" || physicalField?.tag !== "text")
      throw new Error("Missing fixture storage")
    const columns = port
      .query(`PRAGMA table_info(${quoteIdentifier(physicalTable.value)})`)
      .rows.map((row) => {
        const name = row[1]
        if (name?.tag !== "text") throw new Error("Missing fixture column")
        const column = quoteIdentifier(name.value)
        return name.value === physicalField.value
          ? `replace(${column}, 'Z', '001+00:00') AS ${column}`
          : column
      })
    port.execSchema(
      `CREATE VIEW external_source AS SELECT ${columns.join(", ")} FROM ${quoteIdentifier(physicalTable.value)}`
    )
    port.execSchema(
      `UPDATE eidos__tables SET name = 'external_source', physical_name = 'external_source', settings_json = '{"tableType":"virtual"}'`
    )
    const core = new EidosFileRuntime(
      new ConnectionPortEidosFileConnection(port)
    )
    for (const value of [
      "2026-11-16T00:00:00.124Z",
      "2026-11-16T08:00:00.124+08:00",
    ]) {
      const result = core.getRowPage(table.table.id, 0, 20, {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            { type: "rule", field: when.id, operator: "greater-than", value },
          ],
        },
      })
      expect(result.rows).toHaveLength(1)
      expect(result.total).toBe(1)
    }
  } finally {
    await service.close({ requestId: "close-row-positions" })
    port.close()
  }
})
