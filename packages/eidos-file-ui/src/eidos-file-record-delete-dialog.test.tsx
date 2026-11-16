// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EidosFileRecordDeleteDialog } from "./eidos-file-record-delete-dialog"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("EidosFileRecordDeleteDialog", () => {
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
        <EidosFileRecordDeleteDialog
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
        <EidosFileRecordDeleteDialog
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
        <EidosFileRecordDeleteDialog
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

  it("shows the full selection count, preserves failure for retry and supports cancellation", async () => {
    const row = { _id: "row_1", title: "First" }
    const onDelete = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("deleteRows accepts at most 500 Row IDs per atomic operation")
      )
      .mockResolvedValue(undefined)
    const onOpenChange = vi.fn()
    const onError = vi.fn()
    await act(async () =>
      root.render(
        <EidosFileRecordDeleteDialog
          row={row}
          count={501}
          onDelete={onDelete}
          onOpenChange={onOpenChange}
          onError={onError}
        />
      )
    )
    expect(document.body.textContent).toContain("Delete 501 records?")
    const button = (text: string) =>
      Array.from(document.body.querySelectorAll("button")).find(
        (button) => button.textContent === text
      )!
    await act(async () => {
      button("Delete 501 records").click()
      await Promise.resolve()
    })
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "at most 500"
    )
    expect(onError).toHaveBeenCalledOnce()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    await act(async () => button("Cancel").click())
    expect(onDelete).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
    onOpenChange.mockClear()
    await act(async () => {
      button("Delete 501 records").click()
      await Promise.resolve()
    })
    expect(onDelete).toHaveBeenCalledTimes(2)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
