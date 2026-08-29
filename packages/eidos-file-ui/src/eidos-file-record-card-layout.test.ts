import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { describe, expect, it } from "vitest"

import {
  createEidosFileRecordCardLayout,
  eidosFileRecordCardPageProjection,
  isEidosFileRecordCoverField,
  selectEidosFileRecordCardFields,
  type EidosFileRecordCardFieldLayout,
  type EidosFileRecordCardLayout,
} from "./eidos-file-record-card-layout"

function recordField(index: number): EidosFileRecordCardFieldLayout {
  const tableColumnName = `field_${index}`
  const field: EidosFileFieldInfo = {
    id: `0198c72d-82b5-7000-8000-${index.toString().padStart(12, "0")}`,
    tableId: "0198c72d-82b5-7000-8000-000000000010",
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
  fields: EidosFileRecordCardFieldLayout[],
  overrides: Partial<EidosFileRecordCardLayout> = {}
): EidosFileRecordCardLayout {
  return {
    fields,
    coverField: null,
    fieldLimit: 6,
    fitContent: true,
    hideEmptyFields: true,
    ...overrides,
  }
}

describe("selectEidosFileRecordCardFields", () => {
  it("stops reading row values once the card field limit is filled", () => {
    const fields = Array.from({ length: 1_000 }, (_, index) =>
      recordField(index)
    )
    const values = Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => [`field_${index}`, "value"])
    ) as EidosFileRow
    let rowReads = 0
    const row = new Proxy(values, {
      get(target, property, receiver) {
        if (typeof property === "string" && property.startsWith("field_")) {
          rowReads += 1
        }
        return Reflect.get(target, property, receiver)
      },
    })

    const selected = selectEidosFileRecordCardFields(cardLayout(fields), row)

    expect(selected.map(({ field }) => field.tableColumnName)).toEqual(
      Array.from({ length: 6 }, (_, index) => `field_${index}`)
    )
    expect(rowReads).toBe(6)
  })

  it("keeps scanning sparse rows until enough non-empty fields are found", () => {
    const fields = Array.from({ length: 1_000 }, (_, index) =>
      recordField(index)
    )
    const row: EidosFileRow = {
      field_0: 0,
      field_250: false,
      field_700: "ready",
      field_999: "done",
    }

    const selected = selectEidosFileRecordCardFields(
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
    const row = new Proxy<EidosFileRow>(
      {},
      {
        get(target, property, receiver) {
          rowReads += 1
          return Reflect.get(target, property, receiver)
        },
      }
    )

    const selected = selectEidosFileRecordCardFields(
      cardLayout(fields, { hideEmptyFields: false }),
      row
    )

    expect(selected).toEqual(fields.slice(0, 6))
    expect(rowReads).toBe(0)
  })

  it("hides canonical empty JSON arrays", () => {
    const arrayField = {
      ...recordField(0),
      field: {
        ...recordField(0).field,
        type: "multi-select" as const,
        storageCodec: "json_array" as const,
      },
    }

    expect(
      selectEidosFileRecordCardFields(cardLayout([arrayField]), {
        field_0: "[]",
      })
    ).toEqual([])
  })
})

describe("createEidosFileRecordCardLayout", () => {
  it("accepts File and field-level image URL covers only", () => {
    const base = recordField(1).field
    expect(
      isEidosFileRecordCoverField({
        ...base,
        type: "file",
        storageCodec: "json_array",
      })
    ).toBe(true)
    expect(
      isEidosFileRecordCoverField({
        ...base,
        type: "url",
        property: { display: { kind: "image" } },
      })
    ).toBe(true)
    expect(
      isEidosFileRecordCoverField({
        ...base,
        type: "formula",
        property: { displayType: "url", display: { kind: "image" } },
        valueKind: "derived",
        isDerived: true,
      })
    ).toBe(true)
    expect(
      isEidosFileRecordCoverField({ ...base, type: "url", property: null })
    ).toBe(false)
  })

  it("uses explicit cardFields order and canonical coverFit", () => {
    const first = recordField(1).field
    const second = recordField(2).field
    const omitted = recordField(3).field
    const layout = createEidosFileRecordCardLayout([first, second, omitted], {
      id: "view_gallery",
      name: "Gallery",
      type: "gallery",
      tableId: "tasks",
      query: "{}",
      properties: {
        cardFields: [second.id, first.id],
        coverFit: "contain",
      },
      filter: null,
      sorts: [],
      orderMap: null,
      hiddenFields: [],
      position: 1,
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    })

    expect(layout.fields.map(({ field }) => field.id)).toEqual([
      second.id,
      first.id,
    ])
    expect(layout.fieldLimit).toBe(2)
    expect(layout.fitContent).toBe(true)
  })

  it("omits the Kanban grouping field by default but respects an explicit card layout", () => {
    const title = {
      ...recordField(0).field,
      tableColumnName: "title",
      isRecordLabel: true,
    }
    const detail = recordField(1).field
    const group = { ...recordField(2).field, type: "select" as const }
    const board: EidosFileViewInfo = {
      id: "view_board",
      name: "Board",
      type: "kanban",
      tableId: "tasks",
      query: "SELECT * FROM tb_tasks",
      properties: { groupField: group.id },
      filter: null,
      sorts: [],
      orderMap: null,
      hiddenFields: [],
      position: 1,
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    }

    expect(
      createEidosFileRecordCardLayout(
        [title, detail, group],
        board,
        true
      ).fields.map(({ field }) => field.id)
    ).toEqual([detail.id])
    expect(
      createEidosFileRecordCardLayout(
        [title, detail, group],
        {
          ...board,
          properties: {
            ...board.properties,
            cardFields: [group.id, detail.id],
          },
        },
        true
      ).fields.map(({ field }) => field.id)
    ).toEqual([group.id, detail.id])
  })
})

describe("eidosFileRecordCardPageProjection", () => {
  it("keeps visible card fields, cover, and Kanban grouping without hidden payload", () => {
    const title = recordField(0).field
    const visible = recordField(1).field
    const cover = { ...recordField(2).field, type: "file" as const }
    const group = { ...recordField(3).field, type: "select" as const }
    const hidden = recordField(4).field

    expect(
      eidosFileRecordCardPageProjection(
        [
          {
            ...title,
            type: "text",
            tableColumnName: "title",
            isRecordLabel: true,
          },
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
            coverField: cover.id,
            groupField: group.id,
          },
          filter: null,
          sorts: [],
          orderMap: null,
          hiddenFields: [cover.id, group.id, hidden.id],
          position: 1,
          createdAt: "2026-07-14T00:00:00.000Z",
          updatedAt: "2026-07-14T00:00:00.000Z",
        }
      )
    ).toEqual({
      columns: [visible.tableColumnName],
      preservedColumns: [cover.tableColumnName, group.tableColumnName],
      fieldLimit: 4,
      omitEmptyFields: true,
    })
  })

  it("keeps wide Gallery payloads row-bounded and ignores stale grouping", () => {
    const fields = Array.from(
      { length: 1_000 },
      (_, index) => recordField(index).field
    )

    expect(
      eidosFileRecordCardPageProjection(fields, {
        id: "view_gallery",
        name: "Gallery",
        type: "gallery",
        tableId: "tasks",
        query: "SELECT * FROM tb_tasks",
        properties: {
          groupField: "0198c72d-82b5-7000-8000-999999999999",
        },
        filter: null,
        sorts: [],
        orderMap: null,
        hiddenFields: [],
        position: 1,
        createdAt: "2026-07-14T00:00:00.000Z",
        updatedAt: "2026-07-14T00:00:00.000Z",
      })
    ).toEqual({
      columns: fields.map((field) => field.tableColumnName),
      fieldLimit: 6,
      omitEmptyFields: true,
    })
  })

  it("limits the SQL projection when empty card fields remain visible", () => {
    const fields = Array.from(
      { length: 1_000 },
      (_, index) => recordField(index).field
    )

    expect(
      eidosFileRecordCardPageProjection(fields, {
        id: "view_gallery",
        name: "Gallery",
        type: "gallery",
        tableId: "tasks",
        query: "SELECT * FROM tb_tasks",
        properties: { hideEmptyFields: false },
        filter: null,
        sorts: [],
        orderMap: null,
        hiddenFields: [],
        position: 1,
        createdAt: "2026-07-14T00:00:00.000Z",
        updatedAt: "2026-07-14T00:00:00.000Z",
      })
    ).toEqual({
      columns: fields.slice(0, 6).map((field) => field.tableColumnName),
      fieldLimit: 6,
      omitEmptyFields: false,
    })
  })
})
