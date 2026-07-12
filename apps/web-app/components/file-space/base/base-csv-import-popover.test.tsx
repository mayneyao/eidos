// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { BaseCsvImportPlan } from "@eidos.space/base"

import { BaseCsvImportPopover } from "./base-csv-import-popover"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const plan: BaseCsvImportPlan = {
  fileName: "inventory.csv",
  tableName: "inventory",
  rowCount: 2,
  skippedRowCount: 0,
  columns: [
    {
      sourceIndex: 0,
      sourceName: "Item",
      name: "Item",
      columnName: "title",
      type: "title",
    },
    {
      sourceIndex: 1,
      sourceName: "Quantity",
      name: "Quantity",
      columnName: "quantity",
      type: "number",
    },
  ],
  sampleRows: [
    ["Portable stand", "3"],
    ["Desk", "1"],
  ],
  issues: [],
}

describe("BaseCsvImportPopover", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it("previews mapping in an anchored panel and imports a new table", async () => {
    const onSelect = vi.fn().mockResolvedValue({
      canceled: false,
      token: "csv-token",
      plan,
    })
    const onPreview = vi.fn().mockResolvedValue(plan)
    const onImport = vi.fn().mockResolvedValue(undefined)
    await act(async () => {
      root.render(
        <BaseCsvImportPopover
          onSelect={onSelect}
          onPreview={onPreview}
          onImport={onImport}
        />
      )
    })

    const importButton = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Import CSV")
    )
    await act(async () => {
      importButton?.click()
      await Promise.resolve()
    })

    expect(onSelect).toHaveBeenCalledOnce()
    expect(document.body.textContent).toContain("Import as a new table")
    expect(document.body.textContent).toContain("Portable stand")
    expect(document.body.querySelector('[aria-modal="true"]')).toBeNull()

    const type = document.body.querySelector<HTMLSelectElement>(
      'select[aria-label="Quantity type"]'
    )
    await act(async () => {
      if (type) {
        Object.getOwnPropertyDescriptor(
          HTMLSelectElement.prototype,
          "value"
        )?.set?.call(type, "text")
        type.dispatchEvent(new Event("change", { bubbles: true }))
      }
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
    expect(onPreview).toHaveBeenCalledWith("csv-token", {
      tableName: "inventory",
      columns: [
        { sourceIndex: 0, name: "Item" },
        { sourceIndex: 1, name: "Quantity", type: "text" },
      ],
    })

    const form = document.body.querySelector("form")
    await act(async () => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      )
      await Promise.resolve()
    })
    expect(onImport).toHaveBeenCalledWith("csv-token", {
      tableName: "inventory",
      columns: [
        { sourceIndex: 0, name: "Item" },
        { sourceIndex: 1, name: "Quantity", type: "text" },
      ],
    })
  })

  it("keeps conversion errors in the panel and blocks import", async () => {
    const onPreview = vi
      .fn()
      .mockRejectedValue(
        new Error("CSV row 2, field “Quantity” is not a number")
      )
    const onImport = vi.fn()
    await act(async () => {
      root.render(
        <BaseCsvImportPopover
          onSelect={() =>
            Promise.resolve({ canceled: false, token: "csv-token", plan })
          }
          onPreview={onPreview}
          onImport={onImport}
        />
      )
    })
    const button = [...document.body.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.includes("Import CSV")
    )
    await act(async () => {
      button?.click()
      await Promise.resolve()
    })
    const type = document.body.querySelector<HTMLSelectElement>(
      'select[aria-label="Quantity type"]'
    )
    await act(async () => {
      if (type) {
        Object.getOwnPropertyDescriptor(
          HTMLSelectElement.prototype,
          "value"
        )?.set?.call(type, "text")
        type.dispatchEvent(new Event("change", { bubbles: true }))
      }
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain("CSV row 2")
    const submit = [...document.body.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.includes("Import 2 rows")
    )
    expect(submit?.disabled).toBe(true)
    expect(onImport).not.toHaveBeenCalled()
  })
})
