// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BaseStructureDialog } from "./base-structure-dialog"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function setInput(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("BaseStructureDialog", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
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

  it("creates a relation to another Base table without opening a modal", async () => {
    const onCreateField = vi.fn()
    act(() =>
      root.render(
        <BaseStructureDialog
          mode="field"
          open
          onOpenChange={vi.fn()}
          onCreateTable={vi.fn()}
          onCreateField={onCreateField}
          activeTableId="projects"
          tables={[
            {
              id: "projects",
              name: "Projects",
              rawTableName: "tb_projects",
              position: 1,
              icon: null,
              description: null,
              createdAt: "2026-07-12",
              updatedAt: "2026-07-12",
            },
            {
              id: "people",
              name: "People",
              rawTableName: "tb_people",
              position: 2,
              icon: null,
              description: null,
              createdAt: "2026-07-12",
              updatedAt: "2026-07-12",
            },
          ]}
        />
      )
    )

    expect(document.body.querySelector('[aria-modal="true"]')).toBeNull()
    const name = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="Status"]'
    )
    await act(async () => {
      if (name) setInput(name, "Owners")
      document.body
        .querySelector<HTMLButtonElement>('[role="combobox"]')
        ?.click()
    })
    const relation = [
      ...document.body.querySelectorAll('[role="option"]'),
    ].find((option) => option.textContent?.includes("Relation")) as
      | HTMLElement
      | undefined
    await act(async () => relation?.click())

    expect(document.body.textContent).toContain("Related table")
    const form = document.body.querySelector("form")
    await act(async () => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      )
    })

    expect(onCreateField).toHaveBeenCalledWith({
      name: "Owners",
      columnName: "owners",
      type: "link",
      property: {
        targetTableId: "people",
        targetField: "title",
        multiple: true,
      },
    })
  })

  it("creates a calculated formula field in the anchored field flow", async () => {
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
    const name = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="Status"]'
    )
    await act(async () => {
      if (name) setInput(name, "Total")
      document.body
        .querySelector<HTMLButtonElement>('[role="combobox"]')
        ?.click()
    })
    const formulaOption = [
      ...document.body.querySelectorAll('[role="option"]'),
    ].find((option) => option.textContent?.includes("Formula")) as
      | HTMLElement
      | undefined
    await act(async () => formulaOption?.click())
    const formula = document.body.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder^="upper"]'
    )
    await act(async () => {
      if (formula) setInput(formula, "price * quantity")
      document.body
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        )
      await Promise.resolve()
    })
    expect(onCreateField).toHaveBeenCalledWith({
      name: "Total",
      columnName: "total",
      type: "formula",
      property: { formula: "price * quantity", displayType: "text" },
    })
  })
})
