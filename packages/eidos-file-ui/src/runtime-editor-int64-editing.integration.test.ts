// @vitest-environment node
import { GridCellKind } from "@glideapps/glide-data-grid"
import { Runtime } from "@eidos.space/eidos-file"
import { createTestWasmConnection } from "../../eidos-file/src/sqlite-wasm-test-helper"
import { EidosRuntimeEditorDataSource } from "./runtime-editor-data-source"
import {
  eidosFileValueToGridCell,
  gridCellToEidosFileValue,
} from "./eidos-file-grid-adapter"

it("keeps edited Int64 decimal values exact through the canonical Runtime and rejects invalid values", async () => {
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
    { title: "Int64 editors" },
    { cancellation: { cancelled: () => false, onCancel: () => () => {} } }
  )
  const source = new EidosRuntimeEditorDataSource(
    service,
    "int64-editors.eidos"
  )
  try {
    await source.initialize()
    const snapshot = await source.createTable({
      name: "Exact",
      fields: [
        { name: "Title", type: "text", isRecordLabel: true },
        { name: "Integer", type: "integer" },
      ],
    })
    const table = snapshot.tables[0]!,
      field = table.fields.find((f) => f.name === "Integer")!
    const result = await source.insertRow(table.table.id, { [field.id]: 0n }),
      id = String(result.row._id)
    const edit = async (text: string) => {
      const cell = eidosFileValueToGridCell(field, text)
      expect(cell.kind).toBe(GridCellKind.Text)
      if (cell.kind !== GridCellKind.Text)
        throw new Error("Expected exact text editor")
      expect(cell.data).toBe(text)
      return source.updateRow(table.table.id, id, {
        [field.id]: gridCellToEidosFileValue(field, cell),
      })
    }
    const values = [
      "9007199254740990",
      "9007199254740991",
      "9007199254740992",
      "-9007199254740990",
      "-9007199254740991",
      "-9007199254740992",
      "9223372036854775807",
      "-9223372036854775808",
    ]
    for (const decimal of values) {
      await edit(decimal)
      const reopened = await source.getRow(table.table.id, id)
      expect(String(reopened![field.tableColumnName])).toBe(decimal)
      const reopenedCell = eidosFileValueToGridCell(
        field,
        reopened![field.tableColumnName]
      )
      expect(reopenedCell).toMatchObject({
        kind: GridCellKind.Text,
        data: decimal,
        displayData: decimal,
      })
    }
    for (const invalid of [
      "9223372036854775808",
      "-9223372036854775809",
      "1.5",
      "1e3",
      "NaN",
      "01",
      "-0",
    ]) {
      await expect(edit(invalid)).rejects.toThrow()
      expect(
        String(
          (await source.getRow(table.table.id, id))![field.tableColumnName]
        )
      ).toBe(values.at(-1))
    }
    expect(field.nullable).toBe(true)
    await edit("")
    expect(
      (await source.getRow(table.table.id, id))![field.tableColumnName]
    ).toBeNull()
  } finally {
    await service.close({ requestId: "close" })
    await port.close()
  }
})
