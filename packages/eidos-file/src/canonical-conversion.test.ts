import { describe, expect, it } from "vitest"

import {
  eidosFileConversionCanReusePhysicalColumn,
  eidosFileConversionTargetNullable,
  isEidosFileUriReference,
  planCanonicalFieldConversion,
  recommendedEidosFileConversionPolicies,
} from "./canonical-conversion"
import type { StoredFieldType } from "./runtime-contract"

const EDITOR_TYPES = [
  "text",
  "number",
  "checkbox",
  "date",
  "datetime",
  "multi-select",
  "rating",
  "select",
  "url",
] as const

type EditorType = (typeof EDITOR_TYPES)[number]

const EDITOR_ALLOWED_TARGETS: Record<EditorType, readonly EditorType[]> = {
  text: EDITOR_TYPES,
  number: ["text", "number", "checkbox", "rating", "select"],
  checkbox: ["text", "number", "checkbox", "rating", "select"],
  date: ["text", "date", "datetime", "select", "url"],
  datetime: ["text", "date", "datetime", "select", "url"],
  "multi-select": ["text", "multi-select", "select"],
  rating: ["text", "number", "checkbox", "rating", "select"],
  select: EDITOR_TYPES,
  url: ["text", "date", "datetime", "select", "url"],
}

function storedType(type: EditorType): StoredFieldType {
  return type === "rating" ? "integer" : type
}

function compatibleValue(
  from: StoredFieldType,
  to: StoredFieldType
): string | number | bigint {
  switch (from) {
    case "text":
    case "select":
      if (to === "number") return "42.5"
      if (to === "integer") return "4"
      if (to === "checkbox") return "true"
      if (to === "date") return "2026-08-02"
      if (to === "datetime") return "2026-08-02T00:00:00.000Z"
      if (to === "url") return "https://eidos.space"
      return "Alpha"
    case "number":
      return 1
    case "integer":
    case "checkbox":
      return 1n
    case "date":
      return "2026-08-02"
    case "datetime":
      return "2026-08-02T00:00:00.000Z"
    case "url":
      if (to === "date") return "2026-08-02"
      if (to === "datetime") return "2026-08-02T00:00:00.000Z"
      return "https://eidos.space"
    case "multi-select":
    case "file":
    case "relation":
      return '["Alpha"]'
  }
}

describe("canonical Eidos File conversion standard", () => {
  it("accepts only RFC 3986 ASCII URI-reference spellings", () => {
    for (const value of [
      "https://example.com/a?b=1#section",
      "../relative/path",
      "mailto:person@example.com",
      "",
    ]) {
      expect(isEidosFileUriReference(value)).toBe(true)
    }
    for (const value of [
      "https://example.com/bad path",
      "https://example.com/%GG",
      "https://例子.测试/",
      1,
    ]) {
      expect(isEidosFileUriReference(value)).toBe(false)
    }
  })

  it("defines the complete editor conversion route matrix", () => {
    for (const fromEditor of EDITOR_TYPES) {
      for (const toEditor of EDITOR_TYPES) {
        const from = storedType(fromEditor)
        const to = storedType(toEditor)
        const plan = planCanonicalFieldConversion({
          from,
          to,
          toNullable: eidosFileConversionTargetNullable(from, to, true),
          policies: recommendedEidosFileConversionPolicies(from, to),
          rows: [{ id: "row", value: compatibleValue(from, to) }],
        })
        const allowed = EDITOR_ALLOWED_TARGETS[fromEditor].includes(toEditor)
        expect(
          plan.classification === "forbidden",
          `${fromEditor} -> ${toEditor}: ${plan.error ?? plan.classification}`
        ).toBe(!allowed)
      }
    }
  })

  it("keeps policy defaults and nullable rules explicit", () => {
    expect(recommendedEidosFileConversionPolicies("number", "integer")).toEqual(
      ["round-ties-even"]
    )
    expect(recommendedEidosFileConversionPolicies("integer", "number")).toEqual(
      ["round-binary64"]
    )
    expect(
      recommendedEidosFileConversionPolicies("number", "checkbox")
    ).toEqual(["zero-false-nonzero-true"])
    expect(recommendedEidosFileConversionPolicies("datetime", "date")).toEqual([
      "utc-date",
    ])
    expect(
      recommendedEidosFileConversionPolicies("multi-select", "select")
    ).toEqual(["first"])
    expect(
      recommendedEidosFileConversionPolicies("text", "multi-select")
    ).toEqual(["null-to-empty-list"])

    expect(eidosFileConversionTargetNullable("text", "number", false)).toBe(
      false
    )
    expect(
      eidosFileConversionTargetNullable("multi-select", "select", false)
    ).toBe(true)
    expect(
      eidosFileConversionCanReusePhysicalColumn("text", "url", true, true)
    ).toBe(true)
    expect(
      eidosFileConversionCanReusePhysicalColumn("url", "select", true, true)
    ).toBe(true)
    expect(
      eidosFileConversionCanReusePhysicalColumn("date", "text", true, true)
    ).toBe(false)
    expect(
      eidosFileConversionCanReusePhysicalColumn("text", "select", true, false)
    ).toBe(false)
  })

  it("classifies metadata, rewrites, loss, and invalid values", () => {
    expect(
      planCanonicalFieldConversion({
        from: "text",
        to: "select",
        toNullable: true,
        rows: [{ id: "row", value: "Todo" }],
      })
    ).toMatchObject({ classification: "metadata-only", affectedRows: "0" })

    expect(
      planCanonicalFieldConversion({
        from: "date",
        to: "datetime",
        toNullable: true,
        rows: [{ id: "row", value: "2026-08-02" }],
      })
    ).toMatchObject({
      classification: "lossless-rewrite",
      affectedRows: "1",
    })

    expect(
      planCanonicalFieldConversion({
        from: "number",
        to: "integer",
        toNullable: true,
        policies: ["round-ties-even"],
        rows: [{ id: "row", value: 2.5 }],
      })
    ).toMatchObject({
      classification: "explicit-lossy",
      affectedRows: "1",
      valueChanges: expect.arrayContaining([
        { code: "integer-rounded", rows: "1" },
      ]),
    })

    expect(
      planCanonicalFieldConversion({
        from: "multi-select",
        to: "select",
        toNullable: true,
        policies: ["first"],
        rows: [{ id: "row", value: '["Todo","Done"]' }],
      })
    ).toMatchObject({
      classification: "explicit-lossy",
      valueChanges: expect.arrayContaining([
        { code: "list-tail-dropped", rows: "1" },
      ]),
    })

    expect(
      planCanonicalFieldConversion({
        from: "text",
        to: "number",
        toNullable: true,
        rows: [{ id: "row", value: "01" }],
      })
    ).toMatchObject({
      classification: "forbidden",
      error: "Text is not the exact inverse binary64 spelling",
    })
  })

  it("covers stored File and Relation boundaries outside the editor picker", () => {
    expect(
      planCanonicalFieldConversion({
        from: "file",
        to: "text",
        toNullable: false,
        rows: [{ id: "row", value: "[]" }],
      }).classification
    ).toBe("metadata-only")
    expect(
      planCanonicalFieldConversion({
        from: "relation",
        to: "multi-select",
        toNullable: false,
        rows: [{ id: "row", value: "[]" }],
      }).classification
    ).toBe("metadata-only")
    expect(
      planCanonicalFieldConversion({
        from: "file",
        to: "select",
        toNullable: true,
        rows: [{ id: "row", value: "[]" }],
      }).classification
    ).toBe("forbidden")
  })
})
