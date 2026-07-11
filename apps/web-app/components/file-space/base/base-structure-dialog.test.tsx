// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BaseStructureDialog } from "./base-structure-dialog"

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

describe("BaseStructureDialog", () => {
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

  it("creates a table from a compact named form", async () => {
    const onCreateTable = vi.fn()
    act(() =>
      root.render(
        <BaseStructureDialog
          mode="table"
          open
          onOpenChange={vi.fn()}
          onCreateTable={onCreateTable}
          onCreateField={vi.fn()}
        />
      )
    )

    const input = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="Projects"]'
    )
    await act(async () => {
      if (input) setInput(input, "People")
    })
    const form = document.body.querySelector("form")
    await act(async () => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      )
    })

    expect(onCreateTable).toHaveBeenCalledWith({ name: "People" })
  })

  it("creates a text field with a stable column name", async () => {
    const onCreateField = vi.fn()
    act(() =>
      root.render(
        <BaseStructureDialog
          mode="field"
          open
          onOpenChange={vi.fn()}
          onCreateTable={vi.fn()}
          onCreateField={onCreateField}
        />
      )
    )

    const input = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="Status"]'
    )
    await act(async () => {
      if (input) setInput(input, "Project owner")
    })
    const form = document.body.querySelector("form")
    await act(async () => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      )
    })

    expect(onCreateField).toHaveBeenCalledWith({
      name: "Project owner",
      columnName: "project_owner",
      type: "text",
    })
  })
})
