// @vitest-environment jsdom

import { act, type ForwardedRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BaseStructureDialog } from "./base-structure-dialog"

vi.mock("@/components/formula-editor/codemirror-editor", async () => {
  const React = await import("react")
  return {
    CodeMirrorFormulaEditor: React.forwardRef(
      (
        props: { value: string; onChange: (value: string) => void },
        ref: ForwardedRef<{
          focus: () => void
          insertText: (text: string) => void
        }>
      ) => {
        React.useImperativeHandle(ref, () => ({
          focus: () => undefined,
          insertText: (text: string) => props.onChange(props.value + text),
        }))
        return (
          <textarea
            aria-label="Formula expression"
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
          />
        )
      }
    ),
  }
})

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))

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
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    Element.prototype.scrollIntoView = vi.fn()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
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

  it("offers categorized, searchable field types with keyboard selection", async () => {
    act(() =>
      root.render(
        <BaseStructureDialog
          mode="field"
          open
          onOpenChange={vi.fn()}
          onCreateTable={vi.fn()}
          onCreateField={vi.fn()}
        />
      )
    )

    const trigger = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Field type"]'
    )
    await act(async () => trigger?.click())

    expect(document.body.textContent).toContain("Basic")
    expect(document.body.textContent).toContain("Advanced")
    expect(document.body.textContent).toContain("Free-form text content")
    expect(document.body.textContent).toContain(
      "Connect records in another table"
    )

    const search = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Search field types"]'
    )
    await act(async () => {
      if (search) setInput(search, "rollup")
      await Promise.resolve()
    })
    expect(
      document.body.querySelector('[data-field-type="lookup"]')
    ).toBeTruthy()
    expect(document.body.querySelector('[data-field-type="text"]')).toBeNull()

    await act(async () => {
      search?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
      await Promise.resolve()
    })
    expect(trigger?.textContent).toContain("Lookup / rollup")
  })

  it("creates Select options with the same item editor used by field properties", async () => {
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
      if (name) setInput(name, "Status")
      document.body
        .querySelector<HTMLButtonElement>('[role="combobox"]')
        ?.click()
    })
    const selectOption = document.body.querySelector<HTMLElement>(
      '[data-field-type="select"]'
    )
    await act(async () => selectOption?.click())

    expect(document.body.textContent).not.toContain(
      "Separate option values with commas"
    )
    const optionName = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="New option value"]'
    )
    const addOption = () =>
      document.body.querySelector<HTMLButtonElement>(
        'button[aria-label="Add option"]'
      )
    await act(async () => {
      if (optionName) setInput(optionName, "Todo")
      addOption()?.click()
      await Promise.resolve()
    })

    await act(async () => {
      if (optionName) setInput(optionName, "todo")
    })
    expect(addOption()?.disabled).toBe(true)
    expect(document.body.textContent).toContain("Option values must be unique")
    expect(
      document.body.querySelectorAll('button[aria-label^="Reorder Todo"]')
    ).toHaveLength(1)

    await act(async () => {
      if (optionName) setInput(optionName, "Done")
      addOption()?.click()
      await Promise.resolve()
      document.body
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Change Todo color"]'
        )
        ?.click()
      await Promise.resolve()
    })
    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>('button[aria-label="red"]')
        ?.click()
      await Promise.resolve()
    })
    await act(async () => {
      document.body
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        )
      await Promise.resolve()
    })

    expect(onCreateField).toHaveBeenCalledWith({
      name: "Status",
      columnName: "status",
      type: "select",
      property: {
        options: [
          {
            value: "Todo",
            color: "red",
          },
          {
            value: "Done",
            color: "gray",
          },
        ],
      },
    })
  })

  it("creates Number display settings with the same editor used by field properties", async () => {
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
      if (name) setInput(name, "Progress")
      document.body
        .querySelector<HTMLButtonElement>('[role="combobox"]')
        ?.click()
    })
    const numberOption = document.body.querySelector<HTMLElement>(
      '[data-field-type="number"]'
    )
    await act(async () => numberOption?.click())

    expect(document.body.textContent).toContain("Number display")
    await act(async () => {
      ;[...document.body.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "bar")
        ?.click()
      await Promise.resolve()
    })
    const maximum = document.body.querySelector<HTMLInputElement>(
      'input[inputmode="decimal"]'
    )
    await act(async () => {
      if (maximum) {
        maximum.focus()
        setInput(maximum, "250")
      }
    })
    await act(async () => {
      maximum?.blur()
      document.body
        .querySelector<HTMLButtonElement>('button[role="switch"]')
        ?.click()
      await Promise.resolve()
    })
    await act(async () => {
      document.body
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        )
      await Promise.resolve()
    })

    expect(onCreateField).toHaveBeenCalledWith({
      name: "Progress",
      columnName: "progress",
      type: "number",
      property: {
        format: "number",
        showAs: "bar",
        color: "purple",
        divideBy: 250,
        showNumber: false,
      },
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
    const relation = document.body.querySelector<HTMLElement>(
      '[data-field-type="link"]'
    )
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
    const sourceFields = ["price", "quantity"].map((columnName) => ({
      name: columnName,
      type: "number" as const,
      tableName: "tb_orders",
      tableColumnName: columnName,
      property: null,
      storageCodec: "scalar" as const,
      valueKind: "source" as const,
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    }))
    act(() =>
      root.render(
        <BaseStructureDialog
          mode="field"
          open
          onOpenChange={vi.fn()}
          onCreateTable={vi.fn()}
          onCreateField={onCreateField}
          fields={sourceFields}
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
    const formulaOption = document.body.querySelector<HTMLElement>(
      '[data-field-type="formula"]'
    )
    await act(async () => formulaOption?.click())
    const formula = document.body.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Formula expression"]'
    )
    await act(async () => {
      if (formula) setInput(formula, "price * quantity")
    })
    await act(async () => {
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

  it("creates a lookup through an existing relation", async () => {
    const onCreateField = vi.fn()
    const titleField = {
      name: "title",
      type: "title" as const,
      tableName: "tb_people",
      tableColumnName: "title",
      property: null,
      storageCodec: "scalar" as const,
      valueKind: "system" as const,
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    }
    const relationField = {
      ...titleField,
      name: "Owners",
      type: "link" as const,
      tableName: "tb_projects",
      tableColumnName: "owners",
      property: {
        targetTableId: "people",
        targetField: "title",
        multiple: true,
      },
      storageCodec: "relation" as const,
      valueKind: "relation" as const,
    }
    act(() =>
      root.render(
        <BaseStructureDialog
          mode="field"
          open
          onOpenChange={vi.fn()}
          onCreateTable={vi.fn()}
          onCreateField={onCreateField}
          fields={[relationField]}
          tables={[
            {
              id: "people",
              name: "People",
              rawTableName: "tb_people",
              position: 1,
              icon: null,
              description: null,
              createdAt: "2026-07-12",
              updatedAt: "2026-07-12",
            },
          ]}
          tableFields={{ people: [titleField] }}
        />
      )
    )
    const name = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="Status"]'
    )
    await act(async () => {
      if (name) setInput(name, "Owner name")
      document.body
        .querySelector<HTMLButtonElement>('[role="combobox"]')
        ?.click()
    })
    const lookup = document.body.querySelector<HTMLElement>(
      '[data-field-type="lookup"]'
    )
    await act(async () => lookup?.click())
    expect(document.body.textContent).toContain("Target field")
    await act(async () => {
      document.body
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        )
      await Promise.resolve()
    })
    expect(onCreateField).toHaveBeenCalledWith({
      name: "Owner name",
      columnName: "owner_name",
      type: "lookup",
      property: {
        relationField: "owners",
        targetField: "title",
        aggregate: "first",
        displayType: "text",
      },
    })
  })
})
