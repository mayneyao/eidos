import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { BaseFieldInfo } from "@eidos.space/base"

import { BaseQueryToolbar } from "./base-query-toolbar"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const fields: BaseFieldInfo[] = [
  {
    name: "Title",
    type: "title",
    tableName: "tb_tasks",
    tableColumnName: "title",
    property: null,
    storageCodec: "scalar",
    valueKind: "system",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  },
  {
    name: "Priority",
    type: "number",
    tableName: "tb_tasks",
    tableColumnName: "priority",
    property: null,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  },
  {
    name: "Total",
    type: "formula",
    tableName: "tb_tasks",
    tableColumnName: "total",
    property: { formula: "priority * 2", displayType: "number" },
    storageCodec: "scalar",
    valueKind: "derived",
    isHidden: false,
    isDerived: true,
    sourceTableColumnName: null,
    dependsOn: ["priority"],
  },
]

function button(label: string) {
  return Array.from(document.body.querySelectorAll("button"))
    .filter((candidate) => candidate.textContent?.trim() === label)
    .at(-1)
}

describe("BaseQueryToolbar", () => {
  let container: HTMLDivElement
  let root: Root
  const onSearchChange = vi.fn()
  const onFilterChange = vi.fn()
  const onSortsChange = vi.fn()

  beforeEach(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    })
    onSearchChange.mockReset()
    onFilterChange.mockReset()
    onSortsChange.mockReset()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(
        <BaseQueryToolbar
          fields={fields}
          filter={null}
          sorts={[]}
          search=""
          onSearchChange={onSearchChange}
          onFilterChange={onFilterChange}
          onSortsChange={onSortsChange}
        />
      )
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("expands search inline", () => {
    act(() => button("Search")?.click())
    const input = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="Search rows"]'
    )
    expect(input).not.toBeNull()
    act(() => {
      if (!input) return
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set
      setter?.call(input, "roadmap")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    expect(onSearchChange).toHaveBeenCalledWith("roadmap")
  })

  it("builds filter state in an anchored popover", async () => {
    await act(async () => button("Filter")?.click())
    await act(async () => button("Add filter")?.click())
    await act(async () => button("Add condition")?.click())
    await act(async () => button("Apply")?.click())
    expect(onFilterChange).toHaveBeenCalledWith({
      type: "group",
      conjunction: "and",
      children: [
        {
          type: "rule",
          field: "title",
          operator: "equals",
          value: "",
        },
      ],
    })
  })

  it("builds nested groups like the original table filter", async () => {
    await act(async () => button("Filter")?.click())
    await act(async () => button("Add filter")?.click())
    await act(async () => button("Add group")?.click())
    await act(async () => button("Apply")?.click())
    expect(onFilterChange).toHaveBeenCalledWith({
      type: "group",
      conjunction: "and",
      children: [
        {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: "title",
              operator: "equals",
              value: "",
            },
          ],
        },
      ],
    })
  })

  it("offers derived formula and lookup-style fields to the filter UI", async () => {
    await act(async () => button("Filter")?.click())
    await act(async () => button("Add filter")?.click())
    await act(async () => button("Add condition")?.click())
    const fieldSelect =
      document.body.querySelectorAll<HTMLElement>('[role="combobox"]')[1]
    await act(async () => fieldSelect?.click())
    expect(
      Array.from(document.body.querySelectorAll('[role="option"]')).some(
        (option) => option.textContent?.trim() === "Total"
      )
    ).toBe(true)
  })

  it("builds multi-field sort state in an anchored popover", async () => {
    await act(async () => button("Sort")?.click())
    await act(async () => button("Add sort")?.click())
    await act(async () => button("Apply")?.click())
    expect(onSortsChange).toHaveBeenCalledWith([
      { field: "title", direction: "asc" },
    ])
  })
})
