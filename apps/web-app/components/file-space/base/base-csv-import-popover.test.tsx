// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { BaseCsvImportOptions, BaseCsvImportPlan } from "@eidos.space/base"

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

  it("renders a full-label trigger for an empty Base", async () => {
    await act(async () => {
      root.render(
        <BaseCsvImportPopover
          triggerVariant="empty-state"
          onSelect={() =>
            Promise.resolve({ canceled: true, token: null, fileName: null })
          }
          onPreview={() => Promise.resolve(plan)}
          onImport={() => Promise.resolve()}
          onProgress={() => Promise.resolve(null)}
          onCancel={() => Promise.resolve(true)}
        />
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="Import CSV into Base"]'
    )
    expect(trigger?.textContent).toContain("Import CSV")
    expect(trigger?.className).not.toContain("base-workbar-action")
  })

  it("renders a compact sheet-bar trigger that opens upward", async () => {
    await act(async () => {
      root.render(
        <BaseCsvImportPopover
          triggerVariant="sheet-bar"
          onSelect={() =>
            Promise.resolve({ canceled: true, token: null, fileName: null })
          }
          onPreview={() => Promise.resolve(plan)}
          onImport={() => Promise.resolve()}
          onProgress={() => Promise.resolve(null)}
          onCancel={() => Promise.resolve(true)}
        />
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="Import CSV as new Base table"]'
    )
    expect(trigger?.className).toContain("h-full")
    expect(trigger?.className).toContain("border-l")
    expect(trigger?.querySelector("span")?.className).toContain("sr-only")
    expect(trigger?.title).toBe("Import CSV as table")
  })

  it("previews mapping in an anchored panel and imports a new table", async () => {
    const onSelect = vi.fn().mockResolvedValue({
      canceled: false,
      token: "csv-token",
      fileName: plan.fileName,
    })
    const onPreview = vi.fn((_token: string, options: BaseCsvImportOptions) =>
      Promise.resolve(
        options.columns
          ? {
              ...plan,
              columns: plan.columns.map((column) => {
                const override = options.columns?.find(
                  (candidate) => candidate.sourceIndex === column.sourceIndex
                )
                return override?.type
                  ? { ...column, type: override.type }
                  : column
              }),
            }
          : plan
      )
    )
    const onImport = vi.fn().mockResolvedValue(undefined)
    await act(async () => {
      root.render(
        <BaseCsvImportPopover
          onSelect={onSelect}
          onPreview={onPreview}
          onImport={onImport}
          onProgress={() => Promise.resolve(null)}
          onCancel={() => Promise.resolve(true)}
        />
      )
    })

    const importButton = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Import CSV")
    )
    await act(async () => {
      importButton?.click()
      await Promise.resolve()
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
    expect(onPreview).toHaveBeenCalledWith(
      "csv-token",
      {
        tableName: "inventory",
        columns: [
          { sourceIndex: 0, name: "Item" },
          { sourceIndex: 1, name: "Quantity", type: "text" },
        ],
      },
      expect.any(String)
    )

    const form = document.body.querySelector("form")
    await act(async () => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      )
      await Promise.resolve()
    })
    expect(onImport).toHaveBeenCalledWith(
      "csv-token",
      {
        tableName: "inventory",
        columns: [
          { sourceIndex: 0, name: "Item" },
          { sourceIndex: 1, name: "Quantity", type: "text" },
        ],
      },
      expect.any(String)
    )
  })

  it("keeps conversion errors in the panel and blocks import", async () => {
    const onPreview = vi
      .fn()
      .mockResolvedValueOnce(plan)
      .mockRejectedValueOnce(
        new Error("CSV row 2, field “Quantity” is not a number")
      )
    const onImport = vi.fn()
    await act(async () => {
      root.render(
        <BaseCsvImportPopover
          onSelect={() =>
            Promise.resolve({
              canceled: false,
              token: "csv-token",
              fileName: plan.fileName,
            })
          }
          onPreview={onPreview}
          onImport={onImport}
          onProgress={() => Promise.resolve(null)}
          onCancel={() => Promise.resolve(true)}
        />
      )
    })
    const button = [...document.body.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.includes("Import CSV")
    )
    await act(async () => {
      button?.click()
      await Promise.resolve()
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
    expect(document.body.textContent).toContain("Retry check")
    expect(onImport).not.toHaveBeenCalled()
  })

  it("shows worker progress and cancels an in-flight import", async () => {
    let rejectImport: ((error: Error) => void) | undefined
    const onImport = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectImport = reject
        })
    )
    const onCancel = vi.fn(async () => {
      rejectImport?.(new Error("Base CSV operation canceled"))
      return true
    })
    await act(async () => {
      root.render(
        <BaseCsvImportPopover
          onSelect={() =>
            Promise.resolve({
              canceled: false,
              token: "csv-token",
              fileName: plan.fileName,
            })
          }
          onPreview={() => Promise.resolve(plan)}
          onImport={onImport}
          onProgress={(operationId) =>
            Promise.resolve({
              operationId,
              kind: "import",
              status: "running",
              phase: "importing",
              processedBytes: 50,
              totalBytes: 100,
              processedRows: 1,
              totalRows: 2,
              updatedAt: 1,
            })
          }
          onCancel={onCancel}
        />
      )
    })

    const choose = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Import CSV")
    )
    await act(async () => {
      choose?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    const form = document.body.querySelector("form")
    await act(async () => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      )
      await Promise.resolve()
      vi.advanceTimersByTime(150)
      await Promise.resolve()
    })

    expect(
      document.body
        .querySelector('[role="progressbar"]')
        ?.getAttribute("aria-valuenow")
    ).toBe("50")
    const cancel = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Cancel operation")
    )
    await act(async () => {
      cancel?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onCancel).toHaveBeenCalledWith(expect.any(String))
    expect(document.body.textContent).toContain(
      "Import canceled. No rows were added."
    )
  })

  it("opens immediately and can cancel CSV analysis", async () => {
    let rejectPreview: ((error: Error) => void) | undefined
    const onPreview = vi.fn(
      () =>
        new Promise<BaseCsvImportPlan>((_resolve, reject) => {
          rejectPreview = reject
        })
    )
    const onCancel = vi.fn(async () => {
      rejectPreview?.(new Error("Base CSV operation canceled"))
      return true
    })
    await act(async () => {
      root.render(
        <BaseCsvImportPopover
          onSelect={() =>
            Promise.resolve({
              canceled: false,
              token: "csv-token",
              fileName: plan.fileName,
            })
          }
          onPreview={onPreview}
          onImport={() => Promise.resolve()}
          onProgress={(operationId) =>
            Promise.resolve({
              operationId,
              kind: "plan",
              status: "running",
              phase: "analyzing",
              processedBytes: 25,
              totalBytes: 100,
              processedRows: 50,
              totalRows: null,
              updatedAt: 1,
            })
          }
          onCancel={onCancel}
        />
      )
    })

    const choose = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Import CSV")
    )
    await act(async () => {
      choose?.click()
      await Promise.resolve()
      vi.advanceTimersByTime(150)
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain("Analyze CSV")
    expect(
      document.body
        .querySelector('[role="progressbar"]')
        ?.getAttribute("aria-valuenow")
    ).toBe("25")
    const cancel = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Cancel analysis")
    )
    await act(async () => {
      cancel?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onCancel).toHaveBeenCalledWith(expect.any(String))
    expect(document.body.textContent).toContain("CSV analysis canceled")
    expect(document.body.textContent).toContain("Try again")
  })
})
