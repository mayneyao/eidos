// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EidosFileFieldDeleteDialog } from "./eidos-file-field-delete-dialog"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const field: EidosFileFieldInfo = {
  id: "0198c72d-82b5-7000-8000-000000000001",
  tableId: "0198c72d-82b5-7000-8000-000000000010",
  name: "Estimate",
  type: "number",
  tableName: "tb_tasks",
  tableColumnName: "estimate",
  property: null,
  storageCodec: "scalar",
  valueKind: "source",
  isHidden: false,
  isDerived: false,
  sourceTableColumnName: null,
  dependsOn: null,
}

describe("EidosFileFieldDeleteDialog", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("names the field and explains the irreversible data loss before deleting", async () => {
    const onDelete = vi.fn(async () => undefined)
    const onOpenChange = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileFieldDeleteDialog
          field={field}
          onOpenChange={onOpenChange}
          onDelete={onDelete}
        />
      )
    })

    expect(document.body.textContent).toContain("Delete field “Estimate”?")
    expect(document.body.textContent).toContain(
      "All values stored in this field will be permanently removed"
    )
    expect(document.body.textContent).toContain(
      "This cannot be undone from the current view."
    )
    expect(onDelete).not.toHaveBeenCalled()

    await act(async () => {
      Array.from(document.body.querySelectorAll("button"))
        .find((button) => button.textContent === "Delete field")
        ?.click()
      await Promise.resolve()
    })

    expect(onDelete).toHaveBeenCalledWith(field)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("keeps the confirmation open and reports a failed deletion", async () => {
    const error = new Error("Unable to delete field")
    const onDelete = vi.fn(async () => Promise.reject(error))
    const onOpenChange = vi.fn()
    const onError = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileFieldDeleteDialog
          field={field}
          onOpenChange={onOpenChange}
          onDelete={onDelete}
          onError={onError}
        />
      )
    })

    await act(async () => {
      Array.from(document.body.querySelectorAll("button"))
        .find((button) => button.textContent === "Delete field")
        ?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onError).toHaveBeenCalledWith(error)
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(document.body.textContent).toContain("Delete field “Estimate”?")
  })
})
