import { describe, expect, it } from "vitest"

import type { EidosFileFieldInfo, EidosFileRowQuery } from "./types"
import {
  eidosFileRowQueryAffectedByFieldChanges,
  eidosFileRowQueryPredicateColumns,
  compileEidosFileRowQuery,
  normalizeEidosFileFilter,
  normalizeEidosFileRowQuery,
  removeEidosFileFilterField,
} from "./query"

function field(
  column: string,
  type: EidosFileFieldInfo["type"] = "text",
  storageCodec: EidosFileFieldInfo["storageCodec"] = "scalar"
): EidosFileFieldInfo {
  return {
    id: `0198c72d-82b5-7000-8000-${column.padEnd(12, "0").slice(0, 12)}`,
    tableId: "0198c72d-82b5-7000-8000-000000000002",
    name: column,
    type,
    tableName: "tb_tasks",
    tableColumnName: column,
    physicalName: column,
    isRecordLabel: column === "title",
    position: 0,
    settings: {},
    property: null,
    storageCodec,
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }
}

describe("Eidos File row query", () => {
  const fields = [
    field("title", "text"),
    field("priority", "number"),
    field("status", "select"),
    field("labels", "multi-select", "json_array"),
  ]

  it("compiles escaped search, nested filters, and stable multi-column sort", () => {
    const query: EidosFileRowQuery = {
      search: "100%_ready",
      filter: {
        type: "group",
        conjunction: "and",
        children: [
          {
            type: "rule",
            field: "priority",
            operator: "greater-than-or-equal",
            value: 2,
          },
          {
            type: "group",
            conjunction: "or",
            children: [
              {
                type: "rule",
                field: "status",
                operator: "equals",
                value: "doing",
              },
              {
                type: "rule",
                field: "labels",
                operator: "contains",
                value: "urgent",
              },
            ],
          },
        ],
      },
      sorts: [
        { field: "priority", direction: "desc" },
        { field: "title", direction: "asc" },
      ],
    }

    const compiled = compileEidosFileRowQuery(fields, query)
    expect(compiled.whereSql).toContain("ESCAPE '\\'")
    expect(compiled.whereSql).toContain("LIKE ? COLLATE NOCASE")
    expect(compiled.whereSql).not.toContain("eidos_casefold")
    expect(compiled.whereSql).toContain('priority" >= ?')
    expect(compiled.whereSql).toContain("json_each")
    expect(compiled.orderSql).toBe(
      'ORDER BY "priority" DESC NULLS LAST, "title" ASC NULLS LAST, "__base_rowid" ASC'
    )
    expect(compiled.params).toEqual([
      "%100\\%\\_ready%",
      "%100\\%\\_ready%",
      "%100\\%\\_ready%",
      2,
      "doing",
      "urgent",
    ])
  })

  it("searches list, safe File fragments, and generated Relation labels", () => {
    const compiled = compileEidosFileRowQuery(
      [
        field("labels", "multi-select", "json_array"),
        field("attachments", "file", "json_array"),
        field("owners", "relation", "relation"),
      ],
      { search: "Roadmap" }
    )

    expect(compiled.whereSql.match(/json_each/g)).toHaveLength(3)
    expect(compiled.whereSql).toContain("'$.name'")
    expect(compiled.whereSql).toContain("'$.mediaType'")
    expect(compiled.whereSql).toContain("NOT LIKE 'data:%'")
    expect(compiled.whereSql).toContain('"owners__search"')
    expect(compiled.whereSql).not.toContain('json_each("owners")')
    expect(compiled.params).toEqual(Array(5).fill("%Roadmap%"))
  })

  it("keeps Unicode case folding only when the search text needs it", () => {
    const unicode = compileEidosFileRowQuery([field("title", "text")], {
      search: "Straße",
    })
    expect(unicode.whereSql).toContain("eidos_casefold")

    const caselessUnicode = compileEidosFileRowQuery([field("title", "text")], {
      search: "中国ABC",
    })
    expect(caselessUnicode.whereSql).toContain("LIKE ? COLLATE NOCASE")
    expect(caselessUnicode.whereSql).not.toContain("eidos_casefold")
  })

  it("normalizes datetime filter inputs to canonical UTC text", () => {
    const compiled = compileEidosFileRowQuery(
      [field("scheduled", "datetime")],
      {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: "scheduled",
              operator: "greater-than-or-equal",
              value: "2026-07-20T18:00:00+08:00",
            },
          ],
        },
      }
    )

    expect(compiled.params).toEqual(["2026-07-20T10:00:00.000Z"])
    expect(() =>
      compileEidosFileRowQuery([field("scheduled", "datetime")], {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: "scheduled",
              operator: "equals",
              value: "2026-07-20T10:00:00.0001Z",
            },
          ],
        },
      })
    ).toThrow(/sub-millisecond/)
  })

  it("compiles composable rolling week and month windows from one reference instant", () => {
    const referenceInstant = "2026-08-31T12:30:00.000Z"
    const compiled = compileEidosFileRowQuery(
      [field("scheduled", "datetime"), field("day", "date")],
      {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: "scheduled",
              operator: "is-relative-to-today",
              value: { direction: "past", unit: "week" },
            },
            {
              type: "rule",
              field: "day",
              operator: "is-relative-to-today",
              value: { direction: "next", unit: "month" },
            },
          ],
        },
      },
      { referenceInstant }
    )

    expect(compiled.whereSql).toContain(
      'COALESCE("scheduled" >= ? AND "scheduled" <= ?, 0)'
    )
    expect(compiled.whereSql).toContain(
      'COALESCE("day" >= ? AND "day" <= ?, 0)'
    )
    expect(compiled.params).toEqual([
      "2026-08-24T12:30:00.000Z",
      referenceInstant,
      "2026-08-31",
      "2026-09-30",
    ])
  })

  it("uses ISO calendar boundaries for the current week and inclusive date ranges", () => {
    const compiled = compileEidosFileRowQuery(
      [field("day", "date"), field("scheduled", "datetime")],
      {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: "day",
              operator: "is-relative-to-today",
              value: { direction: "this", unit: "week" },
            },
            {
              type: "rule",
              field: "scheduled",
              operator: "is-between",
              value: ["2026-08-20T00:00:00.000Z", "2026-08-21T00:00:00.000Z"],
            },
          ],
        },
      },
      { referenceInstant: "2026-08-20T12:30:00.000Z" }
    )

    expect(compiled.params).toEqual([
      "2026-08-17",
      "2026-08-23",
      "2026-08-20T00:00:00.000Z",
      "2026-08-21T00:00:00.000Z",
    ])
  })

  it("clamps leap-day year windows and computes the current calendar year", () => {
    const fields = [field("scheduled", "datetime"), field("day", "date")]
    const nextYear = compileEidosFileRowQuery(
      fields,
      {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: "scheduled",
              operator: "is-relative-to-today",
              value: { direction: "next", unit: "year" },
            },
            {
              type: "rule",
              field: "day",
              operator: "is-relative-to-today",
              value: { direction: "this", unit: "year" },
            },
          ],
        },
      },
      { referenceInstant: "2024-02-29T12:30:00.000Z" }
    )

    expect(nextYear.params).toEqual([
      "2024-02-29T12:30:00.000Z",
      "2025-02-28T12:30:00.000Z",
      "2024-01-01",
      "2024-12-31",
    ])
  })

  it("rejects relative date windows for non-temporal fields", () => {
    expect(() =>
      compileEidosFileRowQuery(
        [field("title", "text")],
        {
          filter: {
            type: "group",
            conjunction: "and",
            children: [
              {
                type: "rule",
                field: "title",
                operator: "is-relative-to-today",
                value: { direction: "past", unit: "month" },
              },
            ],
          },
        },
        { referenceInstant: "2026-08-20T12:30:00.000Z" }
      )
    ).toThrow(/does not support relative date filters/)
  })

  it("normalizes untrusted IPC and persisted view input", () => {
    expect(
      normalizeEidosFileRowQuery({
        search: "needle",
        sorts: [
          { field: "title", direction: "desc" },
          { field: 42, direction: "asc" },
        ],
        filter: {
          type: "group",
          conjunction: "unexpected",
          children: [
            {
              type: "rule",
              field: "status",
              operator: "equals",
              value: "done",
            },
            { type: "rule", field: "status", operator: "DROP TABLE" },
          ],
        },
      })
    ).toEqual({
      search: "needle",
      sorts: [{ field: "title", direction: "desc", nulls: "last" }],
      filter: {
        type: "group",
        conjunction: "and",
        children: [
          {
            type: "rule",
            field: "status",
            operator: "equals",
            value: "done",
          },
        ],
      },
    })
  })

  it("removes deleted fields from nested persisted filters", () => {
    const filter = normalizeEidosFileFilter({
      type: "group",
      conjunction: "and",
      children: [
        { type: "rule", field: "title", operator: "contains", value: "a" },
        {
          type: "group",
          conjunction: "or",
          children: [
            { type: "rule", field: "status", operator: "equals", value: "x" },
          ],
        },
      ],
    })
    expect(removeEidosFileFilterField(filter, "status")).toEqual({
      type: "group",
      conjunction: "and",
      children: [
        { type: "rule", field: "title", operator: "contains", value: "a" },
      ],
    })
  })

  it("matches multi-select options as exact JSON array values", () => {
    const fields = [field("labels", "multi-select", "json_array")]
    const compiled = compileEidosFileRowQuery(fields, {
      filter: {
        type: "group",
        conjunction: "and",
        children: [
          {
            type: "rule",
            field: "labels",
            operator: "is-any-of",
            value: ["bug", "ux"],
          },
        ],
      },
    })

    expect(compiled.whereSql).toContain(" OR ")
    expect(compiled.whereSql).toContain("json_each")
    expect(compiled.params).toEqual(["bug", "ux"])
  })

  it("treats an empty JSON array as an empty array-backed value", () => {
    const compiled = compileEidosFileRowQuery(
      [field("labels", "multi-select", "json_array")],
      {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: "labels",
              operator: "is-empty",
            },
          ],
        },
      }
    )

    expect(compiled.whereSql).toContain("json_array_length")
    expect(compiled.whereSql).toContain("= 0")
  })

  it("rejects array-backed sorts instead of inventing first-element ordering", () => {
    expect(() =>
      compileEidosFileRowQuery(
        [field("labels", "multi-select", "json_array")],
        {
          sorts: [{ field: "labels", direction: "asc" }],
        }
      )
    ).toThrowError(/does not support this sort position/)
  })

  it("matches relation IDs as exact JSON array members", () => {
    const adaId = "0198c72d-82b5-7968-b163-98be4b7477df"
    const graceId = "0198c72d-82b5-7969-8163-98be4b7477df"
    const relation = {
      ...field("owners", "relation", "relation"),
      valueKind: "relation" as const,
    }
    const compiled = compileEidosFileRowQuery([relation], {
      filter: {
        type: "group",
        conjunction: "and",
        children: [
          {
            type: "rule",
            field: "owners",
            operator: "is-any-of",
            value: [adaId, graceId],
          },
        ],
      },
    })

    expect(compiled.whereSql).toContain("json_each")
    expect(compiled.whereSql).toContain("type = 'text' AND value IS ?")
    expect(compiled.params).toEqual([adaId, graceId])
  })

  it("only invalidates a filtered or sorted query for relevant field changes", () => {
    const query: EidosFileRowQuery = {
      filter: {
        type: "group",
        conjunction: "and",
        children: [
          {
            type: "rule",
            field: "status",
            operator: "equals",
            value: "doing",
          },
        ],
      },
      sorts: [{ field: "priority", direction: "desc" }],
    }

    expect(
      eidosFileRowQueryAffectedByFieldChanges(fields, query, ["title"])
    ).toBe(false)
    expect(
      eidosFileRowQueryAffectedByFieldChanges(fields, query, ["status"])
    ).toBe(true)
    expect(
      eidosFileRowQueryAffectedByFieldChanges(fields, query, ["priority"])
    ).toBe(true)
  })

  it("collects only predicate columns for count-source planning", () => {
    expect([
      ...eidosFileRowQueryPredicateColumns(fields, {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: "status",
              operator: "equals",
              value: "doing",
            },
          ],
        },
        sorts: [{ field: "priority", direction: "desc" }],
      }),
    ]).toEqual(["status"])

    const hidden = { ...field("internal_note"), isHidden: true }
    expect(
      eidosFileRowQueryPredicateColumns([...fields, hidden], {
        search: "release",
      })
    ).toEqual(new Set(["title", "status", "labels"]))
  })

  it("follows transitive derived-field dependencies when invalidating a query", () => {
    const subtotal: EidosFileFieldInfo = {
      ...field("subtotal", "formula"),
      valueKind: "derived",
      isDerived: true,
      dependsOn: ["priority"],
    }
    const score: EidosFileFieldInfo = {
      ...field("score", "formula"),
      valueKind: "derived",
      isDerived: true,
      dependsOn: ["subtotal"],
    }

    expect(
      eidosFileRowQueryAffectedByFieldChanges(
        [...fields, subtotal, score],
        { sorts: [{ field: "score", direction: "desc" }] },
        ["priority"]
      )
    ).toBe(true)
    expect(
      eidosFileRowQueryAffectedByFieldChanges(
        [...fields, subtotal, score],
        { sorts: [{ field: "score", direction: "desc" }] },
        ["status"]
      )
    ).toBe(false)
  })

  it("invalidates search only for searchable fields or their dependencies", () => {
    const hiddenSource: EidosFileFieldInfo = {
      ...field("internal_note"),
      isHidden: true,
    }
    const visibleSummary: EidosFileFieldInfo = {
      ...field("summary", "formula"),
      valueKind: "derived",
      isDerived: true,
      dependsOn: ["internal_note"],
    }
    const systemField: EidosFileFieldInfo = {
      ...field("created_at", "created-time"),
      valueKind: "system",
      isHidden: true,
    }
    const searchFields = [...fields, hiddenSource, visibleSummary, systemField]

    expect(
      eidosFileRowQueryAffectedByFieldChanges(
        searchFields,
        { search: "release" },
        ["title"]
      )
    ).toBe(true)
    expect(
      eidosFileRowQueryAffectedByFieldChanges(
        searchFields,
        { search: "release" },
        ["internal_note"]
      )
    ).toBe(true)
    expect(
      eidosFileRowQueryAffectedByFieldChanges(
        searchFields,
        { search: "release" },
        ["created_at"]
      )
    ).toBe(false)
  })
})
