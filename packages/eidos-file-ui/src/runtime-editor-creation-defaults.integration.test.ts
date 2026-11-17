// @vitest-environment node
import { expect, it, vi } from "vitest"
import {
  Runtime,
  EidosFileRuntime,
  ConnectionPortEidosFileConnection,
  type EidosFileFilterGroup,
} from "@eidos.space/eidos-file"
import { createTestWasmConnection } from "../../eidos-file/src/sqlite-wasm-test-helper"
import { EidosRuntimeEditorDataSource } from "./runtime-editor-data-source"
import { eidosFileMutationHistory } from "./eidos-file-mutation-history"

it.each(["direct", "shared history"])(
  "passes captured filters into canonical creation, preserving explicit values, context, batch time and isolation (%s)",
  async (mode) => {
    const port = await createTestWasmConnection()
    const { service } = await Runtime.create(
      port,
      {
        clock: {
          nowInstant: () => "2026-11-16T16:00:00.123Z",
          nowMilliseconds: () => performance.now(),
        },
        entropy: {
          randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
        },
      },
      { title: "View defaults" },
      {
        cancellation: {
          cancelled: () => false,
          onCancel: () => () => undefined,
        },
      }
    )
    const source = new EidosRuntimeEditorDataSource(service, "synthetic.eidos")
    const insertRow =
      mode === "shared history"
        ? eidosFileMutationHistory(source).source.insertRow
        : source.insertRow.bind(source)
    try {
      await source.initialize()
      const snapshot = await source.createTable({
        name: "Tasks",
        fields: [
          { name: "Title", type: "text" },
          {
            name: "State",
            type: "select",
            property: {
              options: [{ name: "Todo" }, { name: "Done" }],
              defaultOption: "Todo",
            },
          },
          { name: "Flag", type: "checkbox" },
          { name: "Day", type: "date", property: { defaultValue: "now" } },
        ],
      })
      const table = snapshot.tables[0]!,
        id = (name: string) =>
          table.fields.find((field) => field.name === name)!.id
      const filter: EidosFileFilterGroup = {
        type: "group",
        conjunction: "and",
        children: [
          {
            type: "rule",
            field: id("State"),
            operator: "equals",
            value: "Done",
          },
          { type: "rule", field: id("Flag"), operator: "equals", value: true },
          {
            type: "rule",
            field: id("Day"),
            operator: "is-in-calendar-period",
            value: { unit: "year", offset: 1 },
          },
        ],
      }
      const calendar = {
        timeZone: "Asia/Shanghai",
        timeZoneData: "2026f",
        weekStartsOn: 1 as const,
      }
      const creationContext = {
        timeZone: calendar.timeZone,
        timeZoneData: calendar.timeZoneData,
      }
      const query = { filter, calendar }
      const inserted = await insertRow(
        table.table.id,
        {},
        creationContext,
        query
      )
      expect([
        inserted.row[id("State")],
        inserted.row[id("Flag")],
        inserted.row[id("Day")],
      ]).toEqual(["Done", true, "2027-01-01"])
      expect(
        (await source.getPage(table.table.id, 0, 10, query)).rows.map(
          (row) => row._id
        )
      ).toContain(inserted.row._id)
      const edited = await source.updateRow(
        table.table.id,
        String(inserted.row._id),
        { [id("Flag")]: false }
      )
      expect(edited.row[id("Flag")]).toBe(false)
      expect(
        (await source.getPage(table.table.id, 0, 10, query)).rows
      ).toHaveLength(0)
      const explicit = await insertRow(
        table.table.id,
        { [id("State")]: "Todo", [id("Day")]: null },
        creationContext,
        query
      )
      expect([explicit.row[id("State")], explicit.row[id("Day")]]).toEqual([
        "Todo",
        null,
      ])
      const plain = await insertRow(table.table.id, {}, creationContext)
      expect([
        plain.row[id("State")],
        plain.row[id("Flag")],
        plain.row[id("Day")],
      ]).toEqual(["Todo", false, "2026-11-17"])
      const other = await insertRow(table.table.id, {}, creationContext, {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: id("State"),
              operator: "equals",
              value: "Todo",
            },
          ],
        },
      })
      expect(other.row[id("State")]).toBe("Todo")
      const requiredSnapshot = await source.createTable({
        name: "Required",
        fields: [{ name: "Title", type: "text", nullable: false }],
      })
      const required = requiredSnapshot.tables.find(
        (table) => table.table.name === "Required"
      )!
      const title = required.fields.find((field) => field.name === "Title")!.id
      new EidosFileRuntime(
        new ConnectionPortEidosFileConnection(port)
      ).setFieldNullable(title, false)
      await source.initialize()
      await expect(
        insertRow(required.table.id, {}, creationContext, {
          filter: {
            type: "group",
            conjunction: "and",
            children: [{ type: "rule", field: title, operator: "is-empty" }],
          },
        })
      ).rejects.toMatchObject({ code: "invalid-value" })
      const retried = await insertRow(required.table.id, {}, creationContext, {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            { type: "rule", field: title, operator: "equals", value: "valid" },
          ],
        },
      })
      expect(retried.row[title]).toBe("valid")
      const negotiate = service.negotiate.bind(service)
      vi.spyOn(service, "negotiate").mockImplementation(async (...args) => {
        const result = await negotiate(...args)
        delete result.capabilities.viewCreationDefaultsVersion
        return result
      })
      const old = new EidosRuntimeEditorDataSource(service, "old.eidos")
      await old.initialize()
      const mutate = vi.spyOn(service, "mutateRows")
      await expect(
        old.insertRow(table.table.id, {}, creationContext, query)
      ).rejects.toThrow(/does not support view creation defaults/)
      expect(mutate).not.toHaveBeenCalled()
      await old.insertRow(table.table.id, {}, creationContext)
      expect(mutate).toHaveBeenCalledTimes(1)
    } finally {
      vi.restoreAllMocks()
      await service.close({ requestId: "close" })
    }
  }
)
