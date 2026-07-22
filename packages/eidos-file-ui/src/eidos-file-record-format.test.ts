import {
  encodeEidosFileAttachmentPaths,
  type EidosFileFieldInfo,
  type EidosFileRow,
} from "@eidos.space/eidos-file"
import { describe, expect, it } from "vitest"

import { eidosFileRecordFieldText } from "./eidos-file-record-format"

function field(
  type: EidosFileFieldInfo["type"],
  tableColumnName: string,
  property: Record<string, unknown> | null = null
): EidosFileFieldInfo {
  return {
    id: `0198c72d-82b5-7000-8000-${tableColumnName.length.toString().padStart(12, "0")}`,
    tableId: "0198c72d-82b5-7000-8000-000000000010",
    name: tableColumnName,
    type,
    tableName: "tb_tasks",
    tableColumnName,
    property,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }
}

describe("eidosFileRecordFieldText", () => {
  const ownerId = "0198c72d-82b5-7968-b163-98be4b7477df"
  const row: EidosFileRow = {
    _id: "row_1",
    title: "Ship Eidos File",
    status: "In progress",
    owners: JSON.stringify([ownerId]),
    owners__display: JSON.stringify([{ id: ownerId, title: "Ada" }]),
    files: encodeEidosFileAttachmentPaths(["assets/spec.pdf"]),
  }

  it("renders the direct select value", () => {
    expect(
      eidosFileRecordFieldText(
        row,
        field("select", "status", {
          options: [{ value: "In progress", color: "blue" }],
        })
      )
    ).toBe("In progress")
  })

  it("renders relation titles and file paths", () => {
    expect(eidosFileRecordFieldText(row, field("relation", "owners"))).toBe(
      "Ada"
    )
    expect(eidosFileRecordFieldText(row, field("file", "files"))).toBe(
      "assets/spec.pdf"
    )
  })

  it("formats system timestamps as local date-time values", () => {
    const created = {
      ...field("created-time", "_created_time"),
      valueKind: "system" as const,
      isHidden: true,
    }
    const value = "2026-07-14T08:30:00.000Z"
    expect(
      eidosFileRecordFieldText({ ...row, _created_time: value }, created)
    ).toBe(new Date(value).toLocaleString())
  })
})
