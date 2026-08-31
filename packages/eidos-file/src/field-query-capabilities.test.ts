import { describe, expect, it } from "vitest"

import {
  eidosFileFieldQueryCapabilities,
  eidosFileFieldValueType,
  eidosFileTypeRefQueryCapabilities,
} from "./field-query-capabilities"
import type { EidosFileFieldInfo } from "./types"

function field(
  type: EidosFileFieldInfo["type"],
  property: Record<string, unknown> | null = null,
  isRecordLabel = false
): Pick<
  EidosFileFieldInfo,
  "type" | "systemRole" | "property" | "storageCodec" | "isRecordLabel"
> {
  return {
    type,
    property,
    isRecordLabel,
    storageCodec:
      type === "relation"
        ? "relation"
        : type === "file" || type === "multi-select"
          ? "json_array"
          : "scalar",
  }
}

describe("Eidos File field query capabilities", () => {
  it("defines one scalar capability policy for search, filter, sort, and group", () => {
    expect(eidosFileTypeRefQueryCapabilities("text")).toMatchObject({
      searchable: true,
      sortable: true,
      sortPosition: "any",
      groupable: true,
      stringMatch: true,
      ordered: true,
      membership: false,
    })
    expect(eidosFileTypeRefQueryCapabilities("text").filterOperators).toEqual([
      "equals",
      "not-equals",
      "contains",
      "not-contains",
      "starts-with",
      "ends-with",
      "is-empty",
      "is-not-empty",
    ])
    expect(eidosFileTypeRefQueryCapabilities("date").filterOperators).toContain(
      "is-relative-to-today"
    )
    expect(eidosFileTypeRefQueryCapabilities("row-id")).toMatchObject({
      searchable: true,
      sortable: true,
      sortPosition: "last",
      groupable: true,
    })
  })

  it("keeps list membership queryable without advertising invalid sorts", () => {
    for (const type of ["multi-select", "relation"] as const) {
      const capabilities = eidosFileTypeRefQueryCapabilities(type)
      expect(capabilities).toMatchObject({
        membership: true,
        sortable: false,
        sortPosition: null,
        groupable: false,
      })
      expect(capabilities.filterOperators).toEqual([
        "contains",
        "not-contains",
        "is-any-of",
        "is-all-of",
        "is-none-of",
        "is-empty",
        "is-not-empty",
      ])
    }
    expect(eidosFileTypeRefQueryCapabilities("multi-select").searchable).toBe(
      true
    )
    expect(eidosFileTypeRefQueryCapabilities("relation").searchable).toBe(true)
    expect(
      eidosFileTypeRefQueryCapabilities({
        kind: "list",
        element: "row-id",
      }).searchable
    ).toBe(false)
  })

  it("only exposes filters the shared editor can encode for File values", () => {
    expect(eidosFileTypeRefQueryCapabilities("file")).toMatchObject({
      searchable: true,
      filterOperators: ["is-empty", "is-not-empty"],
    })
    expect(
      eidosFileTypeRefQueryCapabilities({
        kind: "list",
        element: "file-entry",
      })
    ).toMatchObject({
      searchable: true,
      filterOperators: ["is-empty", "is-not-empty"],
    })
  })

  it("makes eligible scalar Record Labels searchable without widening ordinary scalar search", () => {
    expect(eidosFileFieldQueryCapabilities(field("number")).searchable).toBe(
      false
    )
    expect(
      eidosFileFieldQueryCapabilities(field("number", null, true)).searchable
    ).toBe(true)
    expect(
      eidosFileFieldQueryCapabilities(field("checkbox", null, true)).searchable
    ).toBe(true)
  })

  it("resolves pseudo, Formula, and Lookup Fields through their logical TypeRef", () => {
    expect(eidosFileFieldValueType(field("rating"))).toBe("integer")
    expect(
      eidosFileFieldValueType(
        field("formula", { displayType: "number", formula: "1" })
      )
    ).toBe("number")
    expect(
      eidosFileFieldValueType(
        field("lookup", {
          aggregate: "values",
          displayType: "row-id",
          valueType: { kind: "list", element: "row-id" },
        })
      )
    ).toEqual({ kind: "list", element: "row-id" })
    expect(
      eidosFileFieldValueType(
        field("lookup", { aggregate: "values", displayType: "json" })
      )
    ).toEqual({ kind: "list", element: "file-entry" })
    expect(
      eidosFileFieldQueryCapabilities(
        field("lookup", {
          aggregate: "values",
          displayType: "row-id",
          valueType: { kind: "list", element: "row-id" },
          relationField: "0198c72d-82b5-7000-8000-000000000001",
        })
      )
    ).toMatchObject({
      membership: true,
      searchable: true,
      sortable: false,
      groupable: false,
    })
  })
})
