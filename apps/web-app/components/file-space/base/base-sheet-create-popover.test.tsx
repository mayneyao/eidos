// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BaseSheetCreatePopover } from "./base-sheet-create-popover"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("BaseSheetCreatePopover", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("uses one plus entry for blank tables and CSV imports", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    const onSelect = vi.fn().mockResolvedValue({
      canceled: true,
      token: null,
      fileName: null,
    })
    await act(async () => {
      root.render(
        <BaseSheetCreatePopover
          onCreate={onCreate}
          csvImportProps={{
            onSelect,
            onPreview: vi.fn(),
            onImport: vi.fn(),
            onProgress: vi.fn().mockResolvedValue(null),
            onCancel: vi.fn().mockResolvedValue(true),
          }}
        />
      )
    })

    expect(
      container.querySelectorAll('[aria-label="Add Base table"]')
    ).toHaveLength(1)
    expect(document.body.textContent).not.toContain("Import CSV")

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Add Base table"]')
        ?.click()
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain("New table")
    expect(document.body.textContent).toContain("Import CSV")

    const importAction = document.body.querySelector<HTMLButtonElement>(
      '[aria-label="Import CSV as new Base table"]'
    )
    await act(async () => {
      importAction?.click()
      await Promise.resolve()
    })
    expect(onSelect).toHaveBeenCalledOnce()

    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("New table"))
        ?.click()
    })

    const input = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="Projects"]'
    )
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set?.call(input, "Projects")
      input?.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent === "Create")
        ?.click()
      await Promise.resolve()
    })

    expect(onCreate).toHaveBeenCalledWith({ name: "Projects" })
  })
})
