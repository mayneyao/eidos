// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileCsvImportOptions,
  EidosFileCsvImportPlan,
} from "@eidos.space/eidos-file"

import { EidosFileCsvImportPopover } from "./eidos-file-csv-import-popover"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const plan: EidosFileCsvImportPlan = {
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
      type: "record-label",
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

async function chooseFieldType(ariaLabel: string, label: string) {
  const trigger = document.body.querySelector<HTMLButtonElement>(
    `button[role="combobox"][aria-label="${ariaLabel}"]`
  )
  await act(async () => {
    trigger?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
    await Promise.resolve()
  })
  const option = Array.from(
    document.body.querySelectorAll<HTMLElement>('[role="option"]')
  ).find((candidate) => candidate.textContent?.trim() === label)
  await act(async () => {
    option?.click()
    await Promise.resolve()
  })
}

describe("EidosFileCsvImportPopover", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it("renders a full-label trigger for an empty Eidos File", async () => {
    await act(async () => {
      root.render(
        <EidosFileCsvImportPopover
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
      '[aria-label="Import CSV into Eidos File"]'
    )
    expect(trigger?.textContent).toContain("Import CSV")
    expect(trigger?.className).not.toContain("eidos-file-workbar-action")
  })

  it("renders a full-width action for the sheet create menu", async () => {
    await act(async () => {
      root.render(
        <EidosFileCsvImportPopover
          triggerVariant="sheet-create"
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
      '[aria-label="Import CSV as new Eidos File table"]'
    )
    expect(trigger?.className).toContain("w-full")
    expect(trigger?.className).toContain("text-left")
    expect(trigger?.textContent).toContain("Import CSV")
    expect(trigger?.textContent).toContain("Create a table from a CSV file")
    expect(trigger?.title).toBe("Import CSV")
  })

  it("previews mapping in an anchored panel and imports a new table", async () => {
    const onSelect = vi.fn().mockResolvedValue({
      canceled: false,
      token: "csv-token",
      fileName: plan.fileName,
    })
    const onPreview = vi.fn(
      (_token: string, options: EidosFileCsvImportOptions) =>
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
        <EidosFileCsvImportPopover
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

    const type = document.body.querySelector<HTMLButtonElement>(
      'button[role="combobox"][aria-label="Quantity type"]'
    )
    expect(
      type?.querySelector('[data-eidos-file-field-type-icon="number"]')
    ).toBeTruthy()
    await chooseFieldType("Quantity type", "Text")
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
        <EidosFileCsvImportPopover
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
    await chooseFieldType("Quantity type", "Text")
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
      rejectImport?.(new Error("Eidos File CSV operation canceled"))
      return true
    })
    await act(async () => {
      root.render(
        <EidosFileCsvImportPopover
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

  it("does not label an import preflight scan as row import progress", async () => {
    await act(async () => {
      root.render(
        <EidosFileCsvImportPopover
          onSelect={() =>
            Promise.resolve({
              canceled: false,
              token: "csv-token",
              fileName: plan.fileName,
            })
          }
          onPreview={() => Promise.resolve(plan)}
          onImport={() => new Promise<void>(() => undefined)}
          onProgress={(operationId) =>
            Promise.resolve({
              operationId,
              kind: "import",
              status: "running",
              phase: "analyzing",
              processedBytes: 50,
              totalBytes: 100,
              processedRows: 1,
              totalRows: null,
              updatedAt: 1,
            })
          }
          onCancel={() => Promise.resolve(true)}
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

    expect(document.body.textContent).toContain("Analyzing CSV… 50%")
    expect(document.body.textContent).not.toContain("Importing rows… 50%")
  })

  it("does not cancel an in-flight import when callbacks change during rerender", async () => {
    const onImport = vi.fn(() => new Promise<void>(() => undefined))
    const firstCancel = vi.fn(async () => true)
    const secondCancel = vi.fn(async () => true)
    const renderPopover = (
      onCancel: (operationId: string) => Promise<boolean>
    ) => (
      <EidosFileCsvImportPopover
        onSelect={() =>
          Promise.resolve({
            canceled: false,
            token: "csv-token",
            fileName: plan.fileName,
          })
        }
        onPreview={() => Promise.resolve(plan)}
        onImport={onImport}
        onProgress={() => Promise.resolve(null)}
        onCancel={onCancel}
      />
    )

    await act(async () => {
      root.render(renderPopover(firstCancel))
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
    })

    expect(onImport).toHaveBeenCalledOnce()
    await act(async () => {
      root.render(renderPopover(secondCancel))
      await Promise.resolve()
    })

    expect(firstCancel).not.toHaveBeenCalled()
    expect(secondCancel).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
    expect(secondCancel).toHaveBeenCalledOnce()
    root = createRoot(container)
  })

  it("opens immediately and can cancel CSV analysis", async () => {
    let rejectPreview: ((error: Error) => void) | undefined
    const onPreview = vi.fn(
      () =>
        new Promise<EidosFileCsvImportPlan>((_resolve, reject) => {
          rejectPreview = reject
        })
    )
    const onCancel = vi.fn(async () => {
      rejectPreview?.(new Error("Eidos File CSV operation canceled"))
      return true
    })
    await act(async () => {
      root.render(
        <EidosFileCsvImportPopover
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
