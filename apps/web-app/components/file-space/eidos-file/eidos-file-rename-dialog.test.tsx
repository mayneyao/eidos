// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EidosFileRenameDialog } from "./eidos-file-rename-dialog"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function setInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("EidosFileRenameDialog", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it("keeps the rename workspace open with the entered name after a failure", async () => {
    const onOpenChange = vi.fn()
    const onRename = vi.fn().mockRejectedValue(new Error("Name already exists"))
    await act(async () => {
      root.render(
        <EidosFileRenameDialog
          kind="table"
          name="Tasks"
          open
          onOpenChange={onOpenChange}
          onRename={onRename}
        />
      )
    })
    const input = document.body.querySelector<HTMLInputElement>("input")

    await act(async () => {
      if (input) setInput(input, "Planning")
      document.body
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        )
      await Promise.resolve()
    })

    expect(onRename).toHaveBeenCalledWith("Planning")
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      "Name already exists"
    )
    expect(input?.value).toBe("Planning")
    expect(input?.getAttribute("aria-invalid")).toBe("true")
  })

  it("prevents duplicate submissions and closes only after persistence succeeds", async () => {
    let resolveRename: (() => void) | undefined
    const onOpenChange = vi.fn()
    const onRename = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRename = resolve
        })
    )
    await act(async () => {
      root.render(
        <EidosFileRenameDialog
          kind="field"
          name="Status"
          open
          onOpenChange={onOpenChange}
          onRename={onRename}
        />
      )
    })
    const input = document.body.querySelector<HTMLInputElement>("input")

    await act(async () => {
      if (input) setInput(input, "Stage")
      document.body
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        )
      await Promise.resolve()
    })

    expect(onRename).toHaveBeenCalledTimes(1)
    expect(input?.disabled).toBe(true)
    expect(
      Array.from(document.body.querySelectorAll("button")).find(
        (button) => button.textContent === "Renaming…"
      )?.disabled
    ).toBe(true)
    expect(onOpenChange).not.toHaveBeenCalledWith(false)

    await act(async () => {
      resolveRename?.()
      await Promise.resolve()
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
