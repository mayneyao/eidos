import type { BaseFieldInfo, BaseRow } from "@eidos.space/base"
import { describe, expect, it } from "vitest"

import { baseRecordFieldText } from "./base-record-format"

function field(
  type: BaseFieldInfo["type"],
  tableColumnName: string,
  property: Record<string, unknown> | null = null
): BaseFieldInfo {
  return {
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

describe("baseRecordFieldText", () => {
  const row: BaseRow = {
    _id: "row_1",
    title: "Ship Base",
    status: "doing",
    owners: '["row_ada"]',
    owners__display: '[{"id":"row_ada","title":"Ada"}]',
    files: '["assets/spec.pdf"]',
  }

  it("renders option names instead of storage IDs", () => {
    expect(
      baseRecordFieldText(
        row,
        field("select", "status", {
          options: [{ id: "doing", name: "In progress", color: "blue" }],
        })
      )
    ).toBe("In progress")
  })

  it("renders relation titles and file paths", () => {
    expect(baseRecordFieldText(row, field("link", "owners"))).toBe("Ada")
    expect(baseRecordFieldText(row, field("file", "files"))).toBe(
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
    expect(baseRecordFieldText({ ...row, _created_time: value }, created)).toBe(
      new Date(value).toLocaleString()
    )
  })
})
