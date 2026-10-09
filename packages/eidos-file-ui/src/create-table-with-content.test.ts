import { it, expect, vi } from "vitest"
import type {
  EidosFileDataSource,
  EidosFileSnapshot,
} from "@eidos.space/eidos-file"
import { createEidosFileTableWithContent } from "./create-table-with-content"

it("declares a writable Text body at table level using the created Field ID", async () => {
  const snapshot = {
    tables: [
      {
        table: { id: "table", name: "Journal" },
        fields: [{ id: "body-id", name: "正文", type: "text" }],
      },
    ],
  } as unknown as EidosFileSnapshot
  const createTable = vi.fn().mockResolvedValue(snapshot)
  const updateTable = vi.fn().mockResolvedValue(snapshot)
  const source = { createTable, updateTable } as unknown as EidosFileDataSource
  await createEidosFileTableWithContent(source, { name: "Journal" }, "正文")
  expect(createTable).toHaveBeenCalledWith({
    name: "Journal",
    fields: [
      { name: "Name", type: "text", isRecordLabel: true },
      { name: "正文", type: "text" },
    ],
  })
  expect(updateTable).toHaveBeenCalledWith("table", {
    contentFieldId: "body-id",
  })
  updateTable.mockClear()
  await createEidosFileTableWithContent(source, { name: "Journal" })
  expect(updateTable).not.toHaveBeenCalled()
})
