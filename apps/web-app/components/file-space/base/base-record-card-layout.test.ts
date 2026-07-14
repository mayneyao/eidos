import type { BaseFieldInfo, BaseRow } from "@eidos.space/base"
import { describe, expect, it } from "vitest"

import {
  baseRecordCardProjectionColumns,
  selectBaseRecordCardFields,
  type BaseRecordCardFieldLayout,
  type BaseRecordCardLayout,
} from "./base-record-card-layout"

function recordField(index: number): BaseRecordCardFieldLayout {
  const tableColumnName = `field_${index}`
  const field: BaseFieldInfo = {
    name: `Field ${index}`,
    type: "text",
    tableName: "tb_tasks",
    tableColumnName,
    property: null,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }
  return { field }
}

function cardLayout(
  fields: BaseRecordCardFieldLayout[],
  overrides: Partial<BaseRecordCardLayout> = {}
): BaseRecordCardLayout {
  return {
    fields,
    coverField: null,
    fieldLimit: 6,
    fitContent: true,
    hideEmptyFields: true,
    ...overrides,
  }
}

describe("selectBaseRecordCardFields", () => {
  it("stops reading row values once the card field limit is filled", () => {
    const fields = Array.from({ length: 1_000 }, (_, index) =>
      recordField(index)
    )
    const values = Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => [`field_${index}`, "value"])
    ) as BaseRow
    let rowReads = 0
    const row = new Proxy(values, {
      get(target, property, receiver) {
        if (typeof property === "string" && property.startsWith("field_")) {
          rowReads += 1
        }
        return Reflect.get(target, property, receiver)
      },
    })

    const selected = selectBaseRecordCardFields(cardLayout(fields), row)

    expect(selected.map(({ field }) => field.tableColumnName)).toEqual(
      Array.from({ length: 6 }, (_, index) => `field_${index}`)
    )
    expect(rowReads).toBe(6)
  })

  it("keeps scanning sparse rows until enough non-empty fields are found", () => {
    const fields = Array.from({ length: 1_000 }, (_, index) =>
      recordField(index)
    )
    const row: BaseRow = {
      field_0: 0,
      field_250: false,
      field_700: "ready",
      field_999: "done",
    }

    const selected = selectBaseRecordCardFields(
      cardLayout(fields, { fieldLimit: 4 }),
      row
    )

    expect(selected.map(({ field }) => field.tableColumnName)).toEqual([
      "field_0",
      "field_250",
      "field_700",
      "field_999",
    ])
  })

  it("does not inspect row values when empty fields stay visible", () => {
    const fields = Array.from({ length: 1_000 }, (_, index) =>
      recordField(index)
    )
    let rowReads = 0
    const row = new Proxy<BaseRow>(
      {},
      {
        get(target, property, receiver) {
          rowReads += 1
          return Reflect.get(target, property, receiver)
        },
      }
    )

    const selected = selectBaseRecordCardFields(
      cardLayout(fields, { hideEmptyFields: false }),
      row
    )

    expect(selected).toEqual(fields.slice(0, 6))
    expect(rowReads).toBe(0)
  })
})

describe("baseRecordCardProjectionColumns", () => {
  it("keeps visible card fields, cover, and Kanban grouping without hidden payload", () => {
    const title = recordField(0).field
    const visible = recordField(1).field
    const cover = { ...recordField(2).field, type: "file" as const }
    const group = { ...recordField(3).field, type: "select" as const }
    const hidden = recordField(4).field

    expect(
      baseRecordCardProjectionColumns(
        [
          { ...title, type: "title", tableColumnName: "title" },
          visible,
          cover,
          group,
          hidden,
        ],
        {
          id: "view_board",
          name: "Board",
          type: "kanban",
          tableId: "tasks",
          query: "SELECT * FROM tb_tasks",
          properties: {
            coverPreview: cover.tableColumnName,
            groupByField: group.tableColumnName,
          },
          filter: null,
          sorts: [],
          orderMap: null,
          hiddenFields: [
            cover.tableColumnName,
            group.tableColumnName,
            hidden.tableColumnName,
          ],
          position: 1,
          createdAt: "2026-07-14 00:00:00",
          updatedAt: "2026-07-14 00:00:00",
        }
      )
    ).toEqual([
      "_id",
      "title",
      visible.tableColumnName,
      cover.tableColumnName,
      group.tableColumnName,
    ])
  })
})
