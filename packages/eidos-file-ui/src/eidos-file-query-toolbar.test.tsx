import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"

import { EidosFileQueryToolbar } from "./eidos-file-query-toolbar"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const fields: EidosFileFieldInfo[] = [
  {
    id: "0198c72d-82b5-7000-8000-000000000001",
    tableId: "0198c72d-82b5-7000-8000-000000000010",
    name: "Title",
    type: "text",
    isRecordLabel: true,
    tableName: "tb_tasks",
    tableColumnName: "title",
    property: null,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  },
  {
    id: "0198c72d-82b5-7000-8000-000000000002",
    tableId: "0198c72d-82b5-7000-8000-000000000010",
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
    id: "0198c72d-82b5-7000-8000-000000000003",
    tableId: "0198c72d-82b5-7000-8000-000000000010",
    name: "Total",
    type: "formula",
    tableName: "tb_tasks",
    tableColumnName: "total",
    property: { formula: '"Priority" * 2', displayType: "number" },
    storageCodec: "scalar",
    valueKind: "derived",
    isHidden: false,
    isDerived: true,
    sourceTableColumnName: null,
    dependsOn: ["0198c72d-82b5-7000-8000-000000000002"],
  },
  {
    id: "0198c72d-82b5-7000-8000-000000000004",
    tableId: "0198c72d-82b5-7000-8000-000000000010",
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
  },
]

function button(label: string) {
  return Array.from(document.body.querySelectorAll("button"))
    .filter((candidate) => candidate.textContent?.trim() === label)
    .at(-1)
}

describe("shared EidosFileQueryToolbar", () => {
  let container: HTMLDivElement
  let root: Root
  const onSearchChange = vi.fn()
  const onNavigateSearch = vi.fn()
  const onFilterChange = vi.fn()
  const onSortsChange = vi.fn()

  beforeEach(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    })
    onSearchChange.mockReset()
    onNavigateSearch.mockReset()
    onFilterChange.mockReset()
    onSortsChange.mockReset()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(
        <EidosFileQueryToolbar
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

  it("opens and refocuses search when the host advances its focus token", () => {
    act(() => {
      root.render(
        <EidosFileQueryToolbar
          fields={fields}
          filter={null}
          sorts={[]}
          search=""
          focusSearchToken={1}
          onSearchChange={onSearchChange}
          onFilterChange={onFilterChange}
          onSortsChange={onSortsChange}
        />
      )
    })
    const input = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="Search rows"]'
    )
    expect(document.activeElement).toBe(input)

    const outside = document.createElement("button")
    document.body.appendChild(outside)
    outside.focus()
    expect(document.activeElement).toBe(outside)

    act(() => {
      root.render(
        <EidosFileQueryToolbar
          fields={fields}
          filter={null}
          sorts={[]}
          search=""
          focusSearchToken={2}
          onSearchChange={onSearchChange}
          onFilterChange={onFilterChange}
          onSortsChange={onSortsChange}
        />
      )
    })
    expect(document.activeElement).toBe(input)
    outside.remove()
  })

  it("navigates filtered row results without leaving the search input", () => {
    act(() => {
      root.render(
        <EidosFileQueryToolbar
          fields={fields}
          filter={null}
          sorts={[]}
          search="roadmap"
          searchResultCount={3}
          searchResultIndex={1}
          onSearchChange={onSearchChange}
          onNavigateSearch={onNavigateSearch}
          onFilterChange={onFilterChange}
          onSortsChange={onSortsChange}
        />
      )
    })

    expect(document.body.textContent).toContain("2 of 3")
    const input = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="Search rows"]'
    )
    const next = document.body.querySelector<HTMLButtonElement>(
      '[aria-label="Next search result"]'
    )
    const previous = document.body.querySelector<HTMLButtonElement>(
      '[aria-label="Previous search result"]'
    )
    act(() => next?.click())
    act(() => previous?.click())
    act(() =>
      input?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    )
    act(() =>
      input?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          bubbles: true,
        })
      )
    )

    expect(onNavigateSearch.mock.calls.map(([direction]) => direction)).toEqual(
      ["next", "previous", "next", "previous"]
    )
    expect(document.activeElement).toBe(input)
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
          field: fields[0].id,
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
              field: fields[0].id,
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

  it("keeps Select option colors visible in filter value controls", async () => {
    const status: EidosFileFieldInfo = {
      ...fields[0],
      id: "0198c72d-82b5-7000-8000-000000000005",
      name: "Status",
      type: "select",
      tableColumnName: "status",
      property: {
        options: [
          { name: "Todo", color: "blue" },
          { name: "Done", color: "green" },
        ],
      },
    }
    await act(async () => {
      root.render(
        <EidosFileQueryToolbar
          fields={[status]}
          filter={null}
          sorts={[]}
          search=""
          onSearchChange={onSearchChange}
          onFilterChange={onFilterChange}
          onSortsChange={onSortsChange}
        />
      )
    })
    await act(async () => button("Filter")?.click())
    await act(async () => button("Add filter")?.click())
    await act(async () => button("Add condition")?.click())
    const valueTrigger = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>(
        'button[role="combobox"]'
      )
    ).at(-1)
    await act(async () => valueTrigger?.click())
    const done = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]')
    ).find((option) => option.textContent?.trim() === "Done")
    expect(
      done?.querySelector('[data-eidos-file-option-color="green"]')
    ).toBeTruthy()
    await act(async () => done?.click())
    expect(
      valueTrigger?.querySelector('[data-eidos-file-option-color="green"]')
    ).toBeTruthy()
  })

  it("offers system timestamps to filter and sort controls", async () => {
    await act(async () => button("Filter")?.click())
    await act(async () => button("Add filter")?.click())
    await act(async () => button("Add condition")?.click())
    const filterField =
      document.body.querySelectorAll<HTMLElement>('[role="combobox"]')[1]
    await act(async () => filterField?.click())
    expect(
      Array.from(document.body.querySelectorAll('[role="option"]')).some(
        (option) => option.textContent?.trim() === "Created at"
      )
    ).toBe(true)

    await act(async () => button("Cancel")?.click())
    await act(async () => button("Sort")?.click())
    await act(async () => button("Add sort")?.click())
    const sortFields = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="combobox"]')
    )
    await act(async () => sortFields.at(-2)?.click())
    expect(
      Array.from(document.body.querySelectorAll('[role="option"]')).some(
        (option) => option.textContent?.trim() === "Created at"
      )
    ).toBe(true)
  })

  it("builds multi-field sort state in an anchored popover", async () => {
    await act(async () => button("Sort")?.click())
    await act(async () => button("Add sort")?.click())
    await act(async () => button("Apply")?.click())
    expect(onSortsChange).toHaveBeenCalledWith([
      { field: fields[0].id, direction: "asc" },
    ])
  })

  it("keeps a failed filter draft open and retries it in place", async () => {
    onFilterChange.mockRejectedValueOnce(new Error("Eidos File is read-only"))
    await act(async () => button("Filter")?.click())
    await act(async () => button("Add filter")?.click())
    await act(async () => button("Add condition")?.click())
    await act(async () => {
      button("Apply")?.click()
      await Promise.resolve()
    })

    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      "Eidos File is read-only"
    )
    expect(
      document.body.querySelector('[aria-label="Remove filter"]')
    ).not.toBeNull()
    expect(button("Apply")).not.toBeUndefined()

    await act(async () => {
      button("Apply")?.click()
      await Promise.resolve()
    })

    expect(onFilterChange).toHaveBeenCalledTimes(2)
    expect(document.body.querySelector('[role="alert"]')).toBeNull()
    expect(button("Apply")).toBeUndefined()
  })

  it("keeps the sort workspace open when clearing persisted sorts fails", async () => {
    act(() => {
      root.render(
        <EidosFileQueryToolbar
          fields={fields}
          filter={null}
          sorts={[{ field: fields[1].id, direction: "desc" }]}
          search=""
          onSearchChange={onSearchChange}
          onFilterChange={onFilterChange}
          onSortsChange={onSortsChange}
        />
      )
    })
    onSortsChange.mockRejectedValueOnce(new Error("Unable to write Eidos File"))
    await act(async () =>
      document.body
        .querySelector<HTMLButtonElement>('[aria-label="Sort Eidos File rows"]')
        ?.click()
    )
    await act(async () => {
      button("Clear")?.click()
      await Promise.resolve()
    })

    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      "Unable to write Eidos File"
    )
    expect(button("Clear")).not.toBeUndefined()
    expect(
      document.body.querySelector('[aria-label="Sort field 1"]')
    ).not.toBeNull()
    expect(
      document.body.querySelector('[aria-label="Sort direction 1"]')
    ).not.toBeNull()
  })
})
