// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { BaseCsvExportPopover } from "./base-csv-export-popover"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("BaseCsvExportPopover", () => {
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

  it("shows row progress and reports the completed export", async () => {
    let resolveExport:
      | ((value: {
          canceled: false
          fileName: string
          result: { exportedRowCount: number }
        }) => void)
      | undefined
    const onExport = vi.fn(
      () =>
        new Promise<{
          canceled: false
          fileName: string
          result: { exportedRowCount: number }
        }>((resolve) => {
          resolveExport = resolve
        })
    )
    await act(async () => {
      root.render(
        <BaseCsvExportPopover
          viewName="Tasks · Open"
          onExport={onExport}
          onProgress={(operationId) =>
            Promise.resolve({
              operationId,
              kind: "export",
              status: "running",
              phase: "exporting",
              processedBytes: 1_024,
              totalBytes: 0,
              processedRows: 50,
              totalRows: 100,
              updatedAt: 1,
            })
          }
          onCancel={() => Promise.resolve(true)}
        />
      )
    })

    const button = [...document.body.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.includes("Export CSV")
    )
    await act(async () => {
      button?.click()
      await Promise.resolve()
      vi.advanceTimersByTime(150)
      await Promise.resolve()
    })

    expect(onExport).toHaveBeenCalledWith(expect.any(String))
    expect(document.body.textContent).toContain("Tasks · Open")
    expect(
      document.body
        .querySelector('[role="progressbar"]')
        ?.getAttribute("aria-valuenow")
    ).toBe("50")

    await act(async () => {
      resolveExport?.({
        canceled: false,
        fileName: "tasks.csv",
        result: { exportedRowCount: 100 },
      })
      await Promise.resolve()
    })
    expect(document.body.textContent).toContain(
      "Exported 100 rows to tasks.csv."
    )
  })

  it("cancels the worker without keeping a partial file", async () => {
    let rejectExport: ((error: Error) => void) | undefined
    const onExport = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectExport = reject
        })
    )
    const onCancel = vi.fn(async () => {
      rejectExport?.(new Error("Base CSV operation canceled"))
      return true
    })
    await act(async () => {
      root.render(
        <BaseCsvExportPopover
          viewName="Tasks · Grid"
          onExport={onExport}
          onProgress={(operationId) =>
            Promise.resolve({
              operationId,
              kind: "export",
              status: "running",
              phase: "exporting",
              processedBytes: 100,
              totalBytes: 0,
              processedRows: 1,
              totalRows: 10,
              updatedAt: 1,
            })
          }
          onCancel={onCancel}
        />
      )
    })
    const start = [...document.body.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.includes("Export CSV")
    )
    await act(async () => {
      start?.click()
      await Promise.resolve()
      vi.advanceTimersByTime(150)
      await Promise.resolve()
    })
    const cancel = [...document.body.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.includes("Cancel export")
    )
    await act(async () => {
      cancel?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onCancel).toHaveBeenCalledWith(expect.any(String))
    expect(document.body.textContent).toContain(
      "Export canceled. No partial CSV was kept."
    )
  })
})
