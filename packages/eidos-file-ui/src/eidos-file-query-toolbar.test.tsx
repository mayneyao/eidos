import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileFieldInfo,
  EidosFileFilterGroup,
} from "@eidos.space/eidos-file"

import { EidosFileUIProvider } from "./context"
import type { EidosFileEditorDataSource } from "./data-source"
import {
  EidosFileFieldFilterEditor,
  EidosFileQueryToolbar,
} from "./eidos-file-query-toolbar"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
)

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

  it("keeps search available while persisted query mutations are disabled", () => {
    act(() => {
      root.render(
        <EidosFileQueryToolbar
          fields={fields}
          filter={null}
          sorts={[]}
          search=""
          mutationsDisabled
          onSearchChange={onSearchChange}
          onFilterChange={onFilterChange}
          onSortsChange={onSortsChange}
        />
      )
    })

    expect(button("Search")?.disabled).toBe(false)
    expect(button("Filter")?.disabled).toBe(true)
    expect(button("Sort")?.disabled).toBe(true)
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
    expect(
      Array.from(document.querySelectorAll("[cmdk-item]")).some(
        (item) => item.textContent?.trim() === "Add group"
      )
    ).toBe(true)
    await act(async () =>
      document.querySelector<HTMLElement>("[cmdk-item]")?.click()
    )
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

  it("creates a group from the empty state only after its first field is chosen", async () => {
    await act(async () => button("Filter")?.click())
    await act(async () =>
      Array.from(document.querySelectorAll<HTMLElement>("[cmdk-item]"))
        .find((item) => item.textContent?.trim() === "Add group")
        ?.click()
    )
    expect(document.querySelectorAll(".eidos-filter-group")).toHaveLength(1)
    const back = document.querySelector<HTMLButtonElement>(
      '[aria-label="Back"]'
    )
    expect(back).toBeTruthy()
    await act(async () =>
      document.querySelector<HTMLElement>("[cmdk-item]")?.click()
    )
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
    await act(async () =>
      document.querySelector<HTMLElement>("[cmdk-item]")?.click()
    )
    const fieldSelect =
      document.body.querySelectorAll<HTMLElement>('[role="combobox"]')[0]
    await act(async () => fieldSelect?.click())
    expect(
      Array.from(document.body.querySelectorAll('[role="option"]')).some(
        (option) => option.textContent?.trim() === "Total"
      )
    ).toBe(true)
  })

  it("uses Runtime field capabilities for Relation filters and sort choices", async () => {
    const relation: EidosFileFieldInfo = {
      ...fields[0],
      id: "0198c72d-82b5-7000-8000-000000000006",
      name: "Owner",
      type: "relation",
      tableColumnName: "owner",
      property: {
        direction: "forward",
        targetTableId: "0198c72d-82b5-7000-8000-000000000020",
        cardinality: "one",
      },
      storageCodec: "relation",
      valueKind: "relation",
      isRecordLabel: false,
    }
    const signals: EidosFileFieldInfo = {
      ...fields[0],
      id: "0198c72d-82b5-7000-8000-000000000007",
      name: "Signals",
      type: "multi-select",
      tableColumnName: "signals",
      property: { options: [] },
      storageCodec: "json_array",
      isRecordLabel: false,
    }
    const files: EidosFileFieldInfo = {
      ...fields[0],
      id: "0198c72d-82b5-7000-8000-000000000008",
      name: "Files",
      type: "file",
      tableColumnName: "files",
      storageCodec: "json_array",
      isRecordLabel: false,
    }
    const owners: EidosFileFieldInfo = {
      ...fields[2],
      id: "0198c72d-82b5-7000-8000-000000000009",
      name: "Owners",
      type: "lookup",
      tableColumnName: "owners",
      property: {
        aggregate: "values",
        displayType: "row-id",
        valueType: { kind: "list", element: "row-id" },
      },
      storageCodec: "json_array",
      isRecordLabel: false,
    }
    const capabilityFields = [...fields, relation, signals, files, owners]
    act(() => {
      root.render(
        <EidosFileQueryToolbar
          fields={capabilityFields}
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
    await act(async () =>
      document.querySelector<HTMLElement>("[cmdk-item]")?.click()
    )
    const filterField =
      document.body.querySelectorAll<HTMLElement>('[role="combobox"]')[0]
    await act(async () => filterField?.click())
    const filterOptions = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]')
    ).map((option) => option.textContent?.trim())
    expect(filterOptions).toEqual(
      expect.arrayContaining(["Owner", "Signals", "Files", "Owners"])
    )
    const owner = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]')
    ).find((option) => option.textContent?.trim() === "Owner")
    await act(async () => owner?.click())
    const operator =
      document.body.querySelectorAll<HTMLElement>('[role="combobox"]')[1]
    await act(async () => operator?.click())
    expect(
      Array.from(document.body.querySelectorAll('[role="option"]')).map(
        (option) => option.textContent?.trim()
      )
    ).toEqual(expect.arrayContaining(["has any of", "has all of"]))

    await act(async () => button("Cancel")?.click())
    await act(async () => button("Sort")?.click())
    await act(async () => button("Add sort")?.click())
    const sortField = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="combobox"]')
    ).at(-2)
    await act(async () => sortField?.click())
    const sortOptions = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]')
    ).map((option) => option.textContent?.trim())
    expect(sortOptions).toEqual(expect.arrayContaining(["Title", "Total"]))
    expect(sortOptions).not.toEqual(
      expect.arrayContaining(["Owner", "Signals", "Files", "Owners"])
    )
  })

  it("selects Relation filter values by target record instead of Row ID", async () => {
    const targetTableId = "0198c72d-82b5-7000-8000-000000000020"
    const adaId = "0198c72d-82b5-7000-8000-000000000021"
    const graceId = "0198c72d-82b5-7000-8000-000000000022"
    const relation: EidosFileFieldInfo = {
      ...fields[0],
      id: "0198c72d-82b5-7000-8000-000000000006",
      name: "Owner",
      type: "relation",
      tableColumnName: "owner",
      property: {
        direction: "forward",
        targetTableId,
        cardinality: "one",
      },
      storageCodec: "relation",
      valueKind: "relation",
      isRecordLabel: false,
    }
    const targetLabel: EidosFileFieldInfo = {
      ...fields[0],
      id: "0198c72d-82b5-7000-8000-000000000023",
      tableId: targetTableId,
      name: "Name",
      tableName: "tb_people",
      tableColumnName: "name",
    }
    const getPage = vi.fn(async () => ({
      rows: [
        { _id: adaId, name: "Ada Lovelace" },
        { _id: graceId, name: "Grace Hopper" },
      ],
    }))
    const source = {
      getSnapshot: vi.fn(async () => ({
        tables: [
          {
            table: { id: targetTableId, name: "People" },
            fields: [targetLabel],
          },
        ],
      })),
      getPage,
      getRow: vi.fn(async (_tableId: string, rowId: string) =>
        rowId === adaId
          ? { _id: adaId, name: "Ada Lovelace" }
          : { _id: graceId, name: "Grace Hopper" }
      ),
    } as unknown as EidosFileEditorDataSource
    act(() => {
      root.render(
        <EidosFileQueryToolbar
          fields={[relation]}
          filter={null}
          sorts={[]}
          search=""
          source={source}
          onSearchChange={onSearchChange}
          onFilterChange={onFilterChange}
          onSortsChange={onSortsChange}
        />
      )
    })

    await act(async () => button("Filter")?.click())
    await act(async () =>
      document.querySelector<HTMLElement>("[cmdk-item]")?.click()
    )
    const operator =
      document.body.querySelectorAll<HTMLElement>('[role="combobox"]')[1]
    await act(async () => operator?.click())
    const anyOf = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]')
    ).find((option) => option.textContent?.trim() === "has any of")
    await act(async () => anyOf?.click())

    const recordPicker = document.body.querySelector<HTMLButtonElement>(
      '[aria-label="Choose records for Owner"]'
    )
    await act(async () => {
      recordPicker?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const recordOption = (name: string) =>
      Array.from(
        document.body.querySelectorAll<HTMLButtonElement>('[role="option"]')
      ).find((option) => option.textContent?.trim() === name)
    expect(recordOption("Ada Lovelace")).toBeTruthy()
    expect(recordOption("Grace Hopper")).toBeTruthy()
    await act(async () => recordOption("Ada Lovelace")?.click())
    await act(async () => recordOption("Grace Hopper")?.click())
    await act(async () => button("Apply")?.click())

    expect(onFilterChange).toHaveBeenCalledWith({
      type: "group",
      conjunction: "and",
      children: [
        {
          type: "rule",
          field: relation.id,
          operator: "is-any-of",
          value: [adaId, graceId],
        },
      ],
    })
    expect(getPage).toHaveBeenCalledWith(
      targetTableId,
      0,
      50,
      {},
      undefined,
      undefined,
      expect.objectContaining({ preservedColumns: ["_id"] })
    )
  })

  it("disables search when the table has no searchable logical fields", () => {
    act(() => {
      root.render(
        <EidosFileQueryToolbar
          fields={[fields[1]]}
          filter={null}
          sorts={[]}
          search=""
          onSearchChange={onSearchChange}
          onFilterChange={onFilterChange}
          onSortsChange={onSortsChange}
        />
      )
    })

    expect(button("Search")?.disabled).toBe(true)
  })

  it("enables search when an otherwise non-searchable scalar is the Record Label", () => {
    act(() => {
      root.render(
        <EidosFileQueryToolbar
          fields={[{ ...fields[1], isRecordLabel: true }]}
          filter={null}
          sorts={[]}
          search=""
          onSearchChange={onSearchChange}
          onFilterChange={onFilterChange}
          onSortsChange={onSortsChange}
        />
      )
    })

    expect(button("Search")?.disabled).toBe(false)
  })

  it("enables search for tables whose only searchable field is a list", () => {
    const signals: EidosFileFieldInfo = {
      ...fields[0],
      id: "0198c72d-82b5-7000-8000-000000000024",
      name: "Signals",
      type: "multi-select",
      tableColumnName: "signals",
      property: { options: [] },
      storageCodec: "json_array",
      isRecordLabel: false,
    }
    act(() => {
      root.render(
        <EidosFileQueryToolbar
          fields={[signals]}
          filter={null}
          sorts={[]}
          search=""
          onSearchChange={onSearchChange}
          onFilterChange={onFilterChange}
          onSortsChange={onSortsChange}
        />
      )
    })

    expect(button("Search")?.disabled).toBe(false)
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
    await act(async () =>
      document.querySelector<HTMLElement>("[cmdk-item]")?.click()
    )
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
    await act(async () =>
      document.querySelector<HTMLElement>("[cmdk-item]")?.click()
    )
    const filterField =
      document.body.querySelectorAll<HTMLElement>('[role="combobox"]')[0]
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

  it("saves rolling date shortcuts without freezing an absolute date", async () => {
    await act(async () => button("Filter")?.click())
    await act(async () =>
      document.querySelector<HTMLElement>("[cmdk-item]")?.click()
    )
    const filterField =
      document.body.querySelectorAll<HTMLElement>('[role="combobox"]')[0]
    await act(async () => filterField?.click())
    const createdAt = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]')
    ).find((option) => option.textContent?.trim() === "Created at")
    await act(async () => createdAt?.click())

    const operator =
      document.body.querySelectorAll<HTMLElement>('[role="combobox"]')[1]
    await act(async () => operator?.click())
    const relative = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]')
    ).find((option) => option.textContent?.trim() === "is relative to today")
    await act(async () => relative?.click())
    expect(
      document.body.querySelector('input[type="datetime-local"]')
    ).toBeNull()
    const relativeHint = Array.from(
      document.body.querySelectorAll<HTMLElement>("span")
    ).find(
      (element) =>
        element.textContent?.trim() === "Filter updates with the current date."
    )
    expect(relativeHint?.parentElement?.classList).not.toContain("col-span-2")
    await act(async () => button("Apply")?.click())

    expect(onFilterChange).toHaveBeenCalledWith({
      type: "group",
      conjunction: "and",
      children: [
        {
          type: "rule",
          field: fields[3].id,
          operator: "is-relative-to-today",
          value: { direction: "this", unit: "week" },
        },
      ],
    })
  })

  it("builds multi-field sort state in an anchored popover", async () => {
    await act(async () => button("Sort")?.click())
    await act(async () => button("Add sort")?.click())
    await act(async () => button("Apply")?.click())
    expect(onSortsChange).toHaveBeenCalledWith([
      { field: fields[0].id, direction: "asc" },
    ])
  })

  it("converts a datetime filter operand to the canonical UTC instant", async () => {
    await act(async () => button("Filter")?.click())
    await act(async () =>
      document.querySelector<HTMLElement>("[cmdk-item]")?.click()
    )
    const fieldSelect =
      document.body.querySelectorAll<HTMLElement>('[role="combobox"]')[0]
    await act(async () => fieldSelect?.click())
    const createdAt = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]')
    ).find((option) => option.textContent?.trim() === "Created at")
    await act(async () => createdAt?.click())

    const valueInput = document.body.querySelector<HTMLInputElement>(
      'input[type="datetime-local"]'
    )
    expect(valueInput).not.toBeNull()
    await act(async () => {
      if (!valueInput) return
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set
      setter?.call(valueInput, "2026-08-07T10:30:15")
      valueInput.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => button("Apply")?.click())

    expect(onFilterChange).toHaveBeenCalledWith({
      type: "group",
      conjunction: "and",
      children: [
        {
          type: "rule",
          field: fields[3].id,
          operator: "equals",
          value: new Date("2026-08-07T10:30:15").toISOString(),
        },
      ],
    })
  })

  it("renders a persisted datetime filter in local time", async () => {
    const instant = new Date("2026-08-07T10:30:15").toISOString()
    await act(async () => {
      root.render(
        <EidosFileQueryToolbar
          fields={fields}
          filter={{
            type: "group",
            conjunction: "and",
            children: [
              {
                type: "rule",
                field: fields[3].id,
                operator: "equals",
                value: instant,
              },
            ],
          }}
          sorts={[]}
          search=""
          onSearchChange={onSearchChange}
          onFilterChange={onFilterChange}
          onSortsChange={onSortsChange}
        />
      )
    })
    await act(async () =>
      document.body
        .querySelector<HTMLButtonElement>(
          '[aria-label="Filter Eidos File rows"]'
        )
        ?.click()
    )

    const valueInput = document.body.querySelector<HTMLInputElement>(
      'input[type="datetime-local"]'
    )
    expect(valueInput?.value).toMatch(/^2026-08-07T10:30:15(?:\.000)?$/)
  })

  it("carries the resolved theme into portalled query controls", async () => {
    await act(async () => {
      root.render(
        <EidosFileUIProvider themeName="dark">
          <EidosFileQueryToolbar
            fields={fields}
            filter={null}
            sorts={[]}
            search=""
            onSearchChange={onSearchChange}
            onFilterChange={onFilterChange}
            onSortsChange={onSortsChange}
          />
        </EidosFileUIProvider>
      )
    })
    await act(async () => button("Sort")?.click())

    const popover = document.body.querySelector(
      "[data-eidos-file-sort-popover]"
    )
    expect(popover?.hasAttribute("data-eidos-file-root")).toBe(true)
    expect(popover?.getAttribute("data-theme")).toBe("dark")
    expect(popover?.classList.contains("eidos-file-root")).toBe(true)
  })

  it("keeps a failed filter draft open and retries it in place", async () => {
    onFilterChange.mockRejectedValueOnce(new Error("Eidos File is read-only"))
    await act(async () => button("Filter")?.click())
    await act(async () =>
      document.querySelector<HTMLElement>("[cmdk-item]")?.click()
    )
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

describe("EidosFileFieldFilterEditor", () => {
  let container: HTMLDivElement
  let root: Root
  const onChange = vi.fn()
  const onClose = vi.fn()
  const onBack = vi.fn()
  const onPendingChange = vi.fn()
  const extension: EidosFileFieldInfo = {
    ...fields[0],
    name: "extension",
    type: "select",
    writable: false,
    property: {
      options: [
        { name: "mp4", color: "orange" },
        { name: "png", color: "green" },
      ],
    },
  }

  const renderEditor = (
    value: EidosFileFilterGroup | null = null,
    disabled = false
  ) => {
    act(() => {
      root.render(
        <React.StrictMode>
          <EidosFileFieldFilterEditor
            field={extension}
            value={value}
            disabled={disabled}
            onChange={onChange}
            onClose={onClose}
            onBack={onBack}
            onPendingChange={onPendingChange}
          />
        </React.StrictMode>
      )
    })
  }

  const selectOption = async (name: string) => {
    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-eidos-file-filter-value] button[role="combobox"]'
    )
    await act(async () => trigger?.click())
    const option = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]')
    ).find((candidate) => candidate.textContent?.trim() === name)
    expect(option).toBeDefined()
    await act(async () => option?.click())
  }

  beforeEach(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    })
    onChange.mockReset()
    onClose.mockReset()
    onBack.mockReset()
    onPendingChange.mockReset()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("selects extension mp4 in a focused field-bound draft before applying", async () => {
    renderEditor()
    const valueTrigger = container.querySelector<HTMLButtonElement>(
      '[data-eidos-file-filter-value] button[role="combobox"]'
    )
    expect(document.activeElement).toBe(valueTrigger)
    expect(container.querySelectorAll('button[role="combobox"]')).toHaveLength(
      2
    )
    await selectOption("mp4")
    expect(onChange).not.toHaveBeenCalled()
    expect(
      valueTrigger?.querySelector('[data-eidos-file-option-color="orange"]')
    ).not.toBeNull()

    await act(async () => button("Apply")?.click())

    expect(onChange).toHaveBeenCalledWith({
      type: "group",
      conjunction: "and",
      children: [
        { type: "rule", field: extension.id, operator: "equals", value: "mp4" },
      ],
    })
    expect(onClose).toHaveBeenCalledOnce()
    expect(onPendingChange.mock.calls).toEqual([[true], [false]])
  })

  it("preserves an existing OR tree under an AND wrapper", async () => {
    const value: EidosFileFilterGroup = {
      type: "group",
      conjunction: "or",
      children: [
        { type: "rule", field: fields[1].id, operator: "equals", value: 5 },
        {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: extension.id,
              operator: "equals",
              value: "png",
            },
          ],
        },
      ],
    }
    renderEditor(value)
    await selectOption("mp4")
    await act(async () => button("Apply")?.click())

    expect(onChange).toHaveBeenCalledWith({
      type: "group",
      conjunction: "and",
      children: [
        value,
        { type: "rule", field: extension.id, operator: "equals", value: "mp4" },
      ],
    })
    expect(onChange.mock.calls[0][0].children[0]).toBe(value)
  })

  it("prefills and replaces one direct AND rule without changing nested rules", async () => {
    const value: EidosFileFilterGroup = {
      type: "group",
      conjunction: "and",
      children: [
        { type: "rule", field: fields[1].id, operator: "equals", value: 5 },
        { type: "rule", field: extension.id, operator: "equals", value: "mp4" },
        {
          type: "group",
          conjunction: "or",
          children: [
            {
              type: "rule",
              field: extension.id,
              operator: "equals",
              value: "mp4",
            },
          ],
        },
      ],
    }
    renderEditor(value)
    expect(
      container.querySelector("[data-eidos-file-filter-value]")?.textContent
    ).toBe("mp4")
    await selectOption("png")
    await act(async () => button("Apply")?.click())

    const next = onChange.mock.calls[0][0] as EidosFileFilterGroup
    expect(next).toEqual({
      ...value,
      children: [
        value.children[0],
        { type: "rule", field: extension.id, operator: "equals", value: "png" },
        value.children[2],
      ],
    })
    expect(next.children[0]).toBe(value.children[0])
    expect(next.children[2]).toBe(value.children[2])
  })

  it("keeps a rejected draft and reports pending while preventing navigation", async () => {
    let rejectSave: ((reason: Error) => void) | undefined
    onChange.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject
        })
    )
    renderEditor()
    await selectOption("mp4")
    await act(async () => button("Apply")?.click())
    expect(onPendingChange.mock.calls).toEqual([[true]])
    const back = container.querySelector<HTMLButtonElement>(
      '[aria-label="Back"]'
    )
    expect(back?.matches(":disabled")).toBe(true)
    expect(button("Cancel")?.matches(":disabled")).toBe(true)
    await act(async () => {
      back?.click()
      button("Cancel")?.click()
      button("Applying…")?.click()
    })
    expect(onChange).toHaveBeenCalledOnce()
    expect(onBack).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => rejectSave?.(new Error("Unable to save this view")))
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Unable to save this view"
    )
    expect(
      container.querySelector("[data-eidos-file-filter-value]")?.textContent
    ).toBe("mp4")
    expect(onPendingChange.mock.calls).toEqual([[true], [false]])
    expect(onClose).not.toHaveBeenCalled()
    expect(back?.matches(":disabled")).toBe(false)

    await act(async () => button("Apply")?.click())
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange.mock.calls[1][0]).toEqual(onChange.mock.calls[0][0])
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("locks editing and Apply after becoming disabled while keeping navigation usable", async () => {
    renderEditor()
    await selectOption("mp4")
    const valueTrigger = container.querySelector<HTMLButtonElement>(
      '[data-eidos-file-filter-value] button[role="combobox"]'
    )
    await act(async () => valueTrigger?.click())
    expect(document.body.querySelector('[role="option"]')).not.toBeNull()

    renderEditor(null, true)
    expect(document.body.querySelector('[role="option"]')).toBeNull()
    const controls = container.querySelectorAll<HTMLButtonElement>(
      'button[role="combobox"]'
    )
    expect([...controls].every((control) => control.matches(":disabled"))).toBe(
      true
    )
    expect(button("Apply")?.matches(":disabled")).toBe(true)
    const back = container.querySelector<HTMLButtonElement>(
      '[aria-label="Back"]'
    )
    expect(back?.matches(":disabled")).toBe(false)
    expect(button("Cancel")?.matches(":disabled")).toBe(false)
    await act(async () => {
      button("Apply")?.click()
      controls[0]?.click()
      controls[1]?.click()
      back?.click()
      button("Cancel")?.click()
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(onPendingChange).not.toHaveBeenCalled()
    expect(onBack).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()

    renderEditor()
    await act(async () => button("Apply")?.click())
    expect(onChange).toHaveBeenCalledWith({
      type: "group",
      conjunction: "and",
      children: [
        { type: "rule", field: extension.id, operator: "equals", value: "mp4" },
      ],
    })
  })

  it.each(["resolves", "rejects"])(
    "clears pending on unmount and ignores a stale save that %s",
    async (outcome) => {
      let finishOldSave: (() => void) | undefined
      let finishNewSave: (() => void) | undefined
      onChange
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve, reject) => {
              finishOldSave = () =>
                outcome === "resolves"
                  ? resolve()
                  : reject(new Error("Old save failed"))
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              finishNewSave = resolve
            })
        )
      renderEditor()
      await selectOption("mp4")
      await act(async () => button("Apply")?.click())
      expect(onPendingChange.mock.calls).toEqual([[true]])

      act(() => root.render(<p>Another panel</p>))
      expect(onPendingChange.mock.calls).toEqual([[true], [false]])
      renderEditor()
      await selectOption("png")
      await act(async () => button("Apply")?.click())
      expect(onPendingChange.mock.calls).toEqual([[true], [false], [true]])

      await act(async () => finishOldSave?.())
      expect(onClose).not.toHaveBeenCalled()
      expect(container.querySelector('[role="alert"]')).toBeNull()
      expect(button("Applying…")?.matches(":disabled")).toBe(true)
      expect(onPendingChange.mock.calls).toEqual([[true], [false], [true]])

      await act(async () => finishNewSave?.())
      expect(onClose).toHaveBeenCalledOnce()
      expect(onPendingChange.mock.calls).toEqual([
        [true],
        [false],
        [true],
        [false],
      ])
    }
  )
})
