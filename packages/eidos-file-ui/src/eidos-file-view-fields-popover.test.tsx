import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  EIDOS_FILE_FORM_INPUT_FIELD_TYPES,
  type EidosFileFieldInfo,
  type EidosFileViewInfo,
} from "@eidos.space/eidos-file"

import { EidosFileViewFieldsPopover } from "./eidos-file-view-fields-popover"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const tableId = "0198c72d-82b5-7000-8000-000000000010"
const fields: EidosFileFieldInfo[] = [
  {
    id: "0198c72d-82b5-7000-8000-000000000001",
    tableId,
    name: "Experiment",
    type: "text",
    isRecordLabel: true,
    position: 0,
    tableName: "Experiments",
    tableColumnName: "Experiment",
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
    tableId,
    name: "Assets",
    type: "file",
    position: 1,
    tableName: "Experiments",
    tableColumnName: "Assets",
    property: null,
    storageCodec: "json_array",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  },
  {
    id: "0198c72d-82b5-7000-8000-000000000003",
    tableId,
    name: "_created_at",
    type: "created-time",
    systemRole: "created-time",
    position: -2,
    tableName: "Experiments",
    tableColumnName: "_created_at",
    property: null,
    storageCodec: "scalar",
    valueKind: "system",
    isHidden: true,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  },
]

const view: EidosFileViewInfo = {
  id: "0198c72d-82b5-7000-8000-000000000100",
  name: "Grid",
  type: "grid",
  tableId,
  query: "{}",
  properties: { visibleSystemFields: [] },
  filter: null,
  sorts: [],
  orderMap: {
    [fields[0]!.id]: 0,
    [fields[1]!.id]: 1,
  },
  hiddenFields: [fields[1]!.id],
  position: 0,
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
}

const formulaField: EidosFileFieldInfo = {
  id: "0198c72d-82b5-7000-8000-000000000004",
  tableId,
  name: "Calculated score",
  type: "formula",
  position: 2,
  tableName: "Experiments",
  tableColumnName: "calculated_score",
  property: { displayType: "number" },
  storageCodec: "materialized_text",
  valueKind: "derived",
  isHidden: false,
  isDerived: true,
  sourceTableColumnName: null,
  dependsOn: [],
}

async function clickButton(label: string) {
  const candidate = Array.from(document.body.querySelectorAll("button")).find(
    (button) =>
      button.textContent?.trim() === label ||
      button.getAttribute("aria-label") === label
  )
  await act(async () => {
    candidate?.click()
    await Promise.resolve()
  })
}

async function keyboardDrag(label: string, direction: "ArrowDown" | "ArrowUp") {
  const handle = document.body.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`
  )
  Array.from(
    document.body.querySelectorAll<HTMLElement>(
      "[data-eidos-file-sortable-field]"
    )
  ).forEach((item, index) => {
    item.getBoundingClientRect = () => new DOMRect(0, index * 40, 240, 32)
  })
  await act(async () => {
    handle?.focus()
    handle?.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        code: "Space",
        key: " ",
      })
    )
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        code: direction,
        key: direction,
      })
    )
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        code: "Space",
        key: " ",
      })
    )
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })
}

describe("EidosFileViewFieldsPopover", () => {
  let container: HTMLDivElement
  let root: Root
  const onUpdate = vi.fn()
  const onFieldOpen = vi.fn()
  const onFieldAdd = vi.fn()

  beforeEach(async () => {
    onUpdate.mockReset()
    onFieldOpen.mockReset()
    onFieldAdd.mockReset()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(
        <EidosFileViewFieldsPopover
          fields={fields}
          view={view}
          onUpdate={onUpdate}
          onFieldOpen={onFieldOpen}
          onFieldAdd={onFieldAdd}
        />
      )
      await Promise.resolve()
    })
    await clickButton("Fields")
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
    container.remove()
  })

  it("shows a hidden ordinary field in the active View", async () => {
    const assets = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Show Assets"]'
    )
    expect(assets?.checked).toBe(false)
    await act(async () => {
      assets?.click()
      await Promise.resolve()
    })
    expect(onUpdate).toHaveBeenCalledWith({ hiddenFields: [] })
  })

  it("hides every configurable field in the active View", async () => {
    await clickButton("Hide all")
    expect(onUpdate).toHaveBeenCalledWith({
      hiddenFields: [fields[1]!.id, fields[0]!.id],
      properties: {
        visibleSystemFields: [],
      },
    })
  })

  it("exposes optional system fields through visibleSystemFields", async () => {
    const created = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Show Created at"]'
    )
    expect(created?.checked).toBe(false)
    await act(async () => {
      created?.click()
      await Promise.resolve()
    })
    expect(onUpdate).toHaveBeenCalledWith({
      properties: {
        visibleSystemFields: [fields[2]!.id],
      },
    })
  })

  it("does not expose field-property editing for system fields", async () => {
    expect(
      document.body.querySelector(
        `button[data-eidos-file-field-properties="${fields[2]!.id}"]`
      )
    ).toBeNull()
    expect(
      document.body.querySelector(
        `[data-eidos-file-system-field="${fields[2]!.id}"]`
      )?.textContent
    ).toContain("Created at")
    expect(document.body.textContent).not.toContain("_created_at")

    await clickButton("Edit Created at properties")
    expect(onFieldOpen).not.toHaveBeenCalled()
  })

  it("places unordered system fields after business fields", () => {
    expect(
      Array.from(
        document.body.querySelectorAll("[data-eidos-file-sortable-field]")
      ).map((row) => row.getAttribute("data-eidos-file-sortable-field"))
    ).toEqual([fields[0]!.id, fields[1]!.id, fields[2]!.id])
  })

  it("opens field properties from the field name without changing visibility", async () => {
    await clickButton("Edit Assets properties")
    expect(onFieldOpen).toHaveBeenCalledWith(fields[1])
    expect(onUpdate).not.toHaveBeenCalled()
    expect(
      document.body.querySelector('[aria-label="Search fields"]')
    ).toBeNull()
  })

  it("opens field creation from the same field management entry", async () => {
    await clickButton("New field")
    expect(onFieldAdd).toHaveBeenCalledTimes(1)
    expect(
      document.body.querySelector('[aria-label="Search fields"]')
    ).toBeNull()
  })

  it("only exposes writable question fields for a Form View", async () => {
    await act(async () => {
      root.render(
        <EidosFileViewFieldsPopover
          fields={[...fields, formulaField]}
          view={{ ...view, name: "Intake", type: "form" }}
          onUpdate={onUpdate}
          onFieldOpen={onFieldOpen}
          onFieldAdd={onFieldAdd}
        />
      )
      await Promise.resolve()
    })

    expect(
      Array.from(
        document.body.querySelectorAll("[data-eidos-file-sortable-field]")
      ).map((row) => row.getAttribute("data-eidos-file-sortable-field"))
    ).toEqual([fields[0]!.id, fields[1]!.id])
    expect(document.body.textContent).not.toContain("Calculated score")
    expect(document.body.textContent).not.toContain("Created at")

    await clickButton("Hide all")
    expect(onUpdate).toHaveBeenLastCalledWith({
      hiddenFields: [fields[1]!.id, fields[0]!.id],
      properties: { visibleSystemFields: [] },
    })
    expect(onUpdate.mock.lastCall?.[0].hiddenFields).not.toContain(
      formulaField.id
    )

    await clickButton("New field")
    expect(onFieldAdd).toHaveBeenLastCalledWith(
      EIDOS_FILE_FORM_INPUT_FIELD_TYPES
    )
  })

  it("reorders all current fields by stable Field ID through the drag handle", async () => {
    expect(document.body.textContent).not.toContain("Move up")
    expect(document.body.textContent).not.toContain("Move down")
    await keyboardDrag("Reorder Assets", "ArrowUp")
    expect(onUpdate).toHaveBeenCalledWith({
      orderMap: {
        [fields[0]!.id]: 1,
        [fields[1]!.id]: 0,
        [fields[2]!.id]: 2,
      },
    })
  })

  it("restores every current field without deleting unknown layout IDs", async () => {
    const unknown = "0198c72d-82b5-7000-8000-000000000099"
    await act(async () => {
      root.render(
        <EidosFileViewFieldsPopover
          fields={fields}
          view={{ ...view, hiddenFields: [fields[1]!.id, unknown] }}
          onUpdate={onUpdate}
          onFieldOpen={onFieldOpen}
        />
      )
      await Promise.resolve()
    })
    await clickButton("Show all")
    expect(onUpdate).toHaveBeenLastCalledWith({
      hiddenFields: [unknown],
      properties: {
        visibleSystemFields: [fields[2]!.id],
      },
    })
  })
})
