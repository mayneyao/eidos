// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BaseRecordDeleteDialog } from "./base-record-delete-dialog"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("BaseRecordDeleteDialog", () => {
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

  it("confirms a destructive card deletion", async () => {
    const row = { _id: "row_1", title: "Write RFC" }
    const onDelete = vi.fn(async () => undefined)
    const onOpenChange = vi.fn()
    await act(async () => {
      root.render(
        <BaseRecordDeleteDialog
          row={row}
          onOpenChange={onOpenChange}
          onDelete={onDelete}
        />
      )
    })
    expect(document.body.textContent).toContain("Delete “Write RFC”?")

    await act(async () => {
      Array.from(document.body.querySelectorAll("button"))
        .find((button) => button.textContent === "Delete record")
        ?.click()
      await Promise.resolve()
    })

    expect(onDelete).toHaveBeenCalledWith(row)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("keeps an open confirmation non-destructive while mutations are blocked", async () => {
    const row = { _id: "row_1", title: "Write RFC" }
    const onDelete = vi.fn(async () => undefined)
    const onOpenChange = vi.fn()
    await act(async () => {
      root.render(
        <BaseRecordDeleteDialog
          row={row}
          disabled
          onOpenChange={onOpenChange}
          onDelete={onDelete}
        />
      )
    })

    const deleteButton = Array.from(
      document.body.querySelectorAll("button")
    ).find((button) => button.textContent === "Delete record")
    expect((deleteButton as HTMLButtonElement | undefined)?.disabled).toBe(true)
    await act(async () => {
      deleteButton?.click()
      await Promise.resolve()
    })
    expect(onDelete).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)

    await act(async () => {
      root.render(
        <BaseRecordDeleteDialog
          row={row}
          onOpenChange={onOpenChange}
          onDelete={onDelete}
        />
      )
    })
    await act(async () => {
      Array.from(document.body.querySelectorAll("button"))
        .find((button) => button.textContent === "Delete record")
        ?.click()
      await Promise.resolve()
    })

    expect(onDelete).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
