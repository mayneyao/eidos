import type {
  EidosFileFieldInfo,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { CompactSelection } from "@glideapps/glide-data-grid"
import { describe, expect, it } from "vitest"

import {
  eidosFileViewFreezeColumns,
  contextRowRanges,
  nextEidosFileFieldSorts,
  orderedEidosFileFields,
} from "./eidos-file-view-layout"

const fields = ["title", "status", "owner"].map(
  (tableColumnName, index): EidosFileFieldInfo => ({
    name: tableColumnName,
    type: index === 0 ? "title" : "text",
    tableName: "tb_tasks",
    tableColumnName,
    property: null,
    storageCodec: "scalar",
    valueKind: index === 0 ? "system" : "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  })
)

const createdTimeField: EidosFileFieldInfo = {
  name: "Created time",
  type: "created-time",
  tableName: "tb_tasks",
  tableColumnName: "_created_time",
  property: null,
  storageCodec: "scalar",
  valueKind: "system",
  isHidden: true,
  isDerived: false,
  sourceTableColumnName: null,
  dependsOn: null,
}

const view: EidosFileViewInfo = {
  id: "view_tasks",
  name: "Grid",
  type: "grid",
  tableId: "tasks",
  query: "SELECT * FROM tb_tasks",
  properties: { freezeColumns: 2 },
  filter: null,
  sorts: [],
  orderMap: { owner: 0, title: 1, status: 2 },
  hiddenFields: [],
  position: 1,
  createdAt: "2026-07-12 00:00:00",
  updatedAt: "2026-07-12 00:00:00",
}

describe("Eidos File view layout commands", () => {
  it("orders and freezes columns from the persisted view", () => {
    expect(
      orderedEidosFileFields(fields, view).map((field) => field.name)
    ).toEqual(["owner", "title", "status"])
    expect(eidosFileViewFreezeColumns(view, fields.length)).toBe(2)
    expect(
      eidosFileViewFreezeColumns(
        { ...view, properties: { freezeColumns: 20 } },
        fields.length
      )
    ).toBe(3)
  })

  it("promotes a field sort while preserving the remaining sort chain", () => {
    expect(
      nextEidosFileFieldSorts(
        [
          { field: "owner", direction: "asc" },
          { field: "status", direction: "desc" },
        ],
        "status",
        "asc"
      )
    ).toEqual([
      { field: "status", direction: "asc" },
      { field: "owner", direction: "asc" },
    ])
  })

  it("keeps system fields hidden by default and persists visibility per view", () => {
    expect(
      orderedEidosFileFields([...fields, createdTimeField], view).map(
        (field) => field.tableColumnName
      )
    ).toEqual(["owner", "title", "status"])
    expect(
      orderedEidosFileFields([...fields, createdTimeField], {
        ...view,
        properties: {
          ...view.properties,
          visibleSystemFields: ["_created_time", "_created_time", 42],
        },
      }).map((field) => field.tableColumnName)
    ).toEqual(["owner", "title", "status", "_created_time"])
  })

  it("uses the clicked row unless it is already part of the selection", () => {
    const selection = {
      columns: CompactSelection.empty(),
      rows: CompactSelection.fromSingleSelection([4, 8]),
      current: undefined,
    }
    expect(contextRowRanges(selection, 6)).toEqual([
      { startIndex: 4, endIndex: 8 },
    ])
    expect(contextRowRanges(selection, 12)).toEqual([
      { startIndex: 12, endIndex: 13 },
    ])
  })
})
