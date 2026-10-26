import { expect, it } from "vitest"
import {
  explorerFromUIFilter,
  explorerToUIFilter,
} from "./explorer-filter-adapter"
import {
  normalizeExplorerFileFilter,
  explorerFilterSignature,
  countExplorerFilterRules,
} from "./explorer-file-filter"

it("round-trips nested file and typed property conditions without changing operands", () => {
  const ui = {
    type: "group" as const,
    conjunction: "and" as const,
    children: [
      {
        type: "rule" as const,
        field: "explorer:suffix",
        operator: "is-none-of" as const,
        value: [".md", ".tar.gz"],
      },
      {
        type: "group" as const,
        conjunction: "or" as const,
        children: [
          {
            type: "rule" as const,
            field: "rating",
            operator: "greater-than-or-equal" as const,
            value: 4,
          },
          {
            type: "rule" as const,
            field: "due",
            operator: "is-relative-to-today" as const,
            value: { direction: "this" as const, unit: "week" as const },
          },
          {
            type: "rule" as const,
            field: "archived",
            operator: "equals" as const,
            value: false,
          },
          {
            type: "rule" as const,
            field: "tags",
            operator: "is-empty" as const,
          },
        ],
      },
    ],
  }
  const filter = normalizeExplorerFileFilter(explorerFromUIFilter(ui))
  expect(explorerToUIFilter(filter)).toEqual(ui)
  expect(countExplorerFilterRules(filter)).toBe(5)
  expect(explorerFilterSignature(filter)).toBe(
    explorerFilterSignature(explorerFromUIFilter(ui, "other-editor"))
  )
})

it("rejects oversized property operands at the host boundary", () => {
  expect(() =>
    normalizeExplorerFileFilter(
      explorerFromUIFilter({
        type: "group",
        conjunction: "and",
        children: [
          {
            type: "rule",
            field: "tags",
            operator: "is-any-of",
            value: Array.from({ length: 129 }, () => "tag"),
          },
        ],
      })
    )
  ).toThrow("Invalid property condition")
})
