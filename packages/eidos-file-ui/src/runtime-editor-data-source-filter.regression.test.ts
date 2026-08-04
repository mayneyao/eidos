import { describe, expect, it } from "vitest"
import type {
  EidosFileFilterGroup,
  FilterNode,
  RuntimeClient,
} from "@eidos.space/eidos-file"

import { EidosRuntimeEditorDataSource } from "./runtime-editor-data-source"

const TITLE = "018f0000-0000-7000-8000-000000000004"

interface FilterBoundary {
  editorFilter(node?: FilterNode): EidosFileFilterGroup | null
  runtimeFilter(group: EidosFileFilterGroup): FilterNode
}

function filterBoundary(): FilterBoundary {
  return new EidosRuntimeEditorDataSource(
    {} as RuntimeClient,
    "fixture.eidos"
  ) as unknown as FilterBoundary
}

describe("Runtime editor filter regression", () => {
  it("keeps a persisted leaf filter flat across repeated editor round trips", () => {
    const boundary = filterBoundary()
    let runtimeFilter: FilterNode = {
      op: "and",
      args: [{ op: "eq", fieldId: TITLE, value: "123" }],
    }
    const expectedEditorFilter: EidosFileFilterGroup = {
      type: "group",
      conjunction: "and",
      children: [
        {
          type: "rule",
          field: TITLE,
          operator: "equals",
          value: "123",
        },
      ],
    }

    for (let roundTrip = 0; roundTrip < 3; roundTrip += 1) {
      const editorFilter = boundary.editorFilter(runtimeFilter)
      expect(editorFilter).toEqual(expectedEditorFilter)
      runtimeFilter = boundary.runtimeFilter(editorFilter!)
    }

    expect(runtimeFilter).toEqual({
      op: "and",
      args: [{ op: "eq", fieldId: TITLE, value: "123" }],
    })
  })

  it("preserves mixed and negated groups", () => {
    const boundary = filterBoundary()
    const runtimeFilter: FilterNode = {
      op: "and",
      args: [
        {
          op: "or",
          args: [
            { op: "eq", fieldId: TITLE, value: "draft" },
            { op: "eq", fieldId: TITLE, value: "ready" },
          ],
        },
        {
          op: "not",
          arg: {
            op: "and",
            args: [{ op: "contains", fieldId: TITLE, value: "archived" }],
          },
        },
      ],
    }

    const editorFilter = boundary.editorFilter(runtimeFilter)

    expect(editorFilter).toEqual({
      type: "group",
      conjunction: "and",
      children: [
        {
          type: "group",
          conjunction: "or",
          children: [
            {
              type: "rule",
              field: TITLE,
              operator: "equals",
              value: "draft",
            },
            {
              type: "rule",
              field: TITLE,
              operator: "equals",
              value: "ready",
            },
          ],
        },
        {
          type: "group",
          conjunction: "and",
          negated: true,
          children: [
            {
              type: "rule",
              field: TITLE,
              operator: "contains",
              value: "archived",
            },
          ],
        },
      ],
    })
    expect(boundary.runtimeFilter(editorFilter!)).toEqual(runtimeFilter)
  })

  it("preserves an explicit group when it uses the same conjunction as its parent", () => {
    const boundary = filterBoundary()
    const editorFilter: EidosFileFilterGroup = {
      type: "group",
      conjunction: "and",
      children: [
        {
          type: "rule",
          field: TITLE,
          operator: "equals",
          value: "active",
        },
        {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: TITLE,
              operator: "contains",
              value: "priority",
            },
          ],
        },
      ],
    }

    const runtimeFilter = boundary.runtimeFilter(editorFilter)

    expect(boundary.editorFilter(runtimeFilter)).toEqual(editorFilter)
  })
})
