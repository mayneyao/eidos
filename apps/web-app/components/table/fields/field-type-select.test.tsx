// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FieldType } from "@/packages/core/fields/const"

import { FieldTypeSelect } from "./field-type-select"

const translations: Record<string, string> = {
  "table.field.text": "Text",
  "table.field.number": "Number",
  "table.field.select": "Select",
  "table.field.multiSelect": "Multi-select",
  "table.field.checkbox": "Checkbox",
  "table.field.rating": "Rating",
  "table.field.url": "URL",
  "table.field.date": "Date",
  "table.field.file": "File",
  "table.field.formula": "Formula",
  "table.field.link": "Relation",
  "table.field.lookup": "Lookup",
  "table.field.title": "Title",
  "table.field.createdTime": "Created time",
  "table.field.lastEditedTime": "Last edited time",
  "table.field.createdBy": "Created by",
  "table.field.lastEditedBy": "Last edited by",
  "table.fieldTypeDescriptions.text": "Plain text content",
  "table.fieldTypeDescriptions.number": "Numeric values with formatting",
  "table.fieldTypeDescriptions.select": "Single predefined choice",
  "table.fieldTypeDescriptions.multiSelect": "Multiple predefined choices",
  "table.fieldTypeDescriptions.checkbox": "A true or false value",
  "table.fieldTypeDescriptions.rating": "A five-star score",
  "table.fieldTypeDescriptions.url": "A web address",
  "table.fieldTypeDescriptions.date": "A calendar date",
  "table.fieldTypeDescriptions.file": "Files and images",
  "table.fieldTypeDescriptions.formula": "A calculated value",
  "table.fieldTypeDescriptions.link": "Records in another table",
  "table.fieldTypeDescriptions.lookup": "Values from related records",
  "table.fieldTypeDescriptions.createdTime": "Set when created",
  "table.fieldTypeDescriptions.lastEditedTime": "Set when edited",
  "table.fieldTypeDescriptions.createdBy": "The creating user",
  "table.fieldTypeDescriptions.lastEditedBy": "The editing user",
  "table.fieldCategories.basic": "Basic",
  "table.fieldCategories.advanced": "Advanced",
  "table.fieldCategories.system": "System",
  "table.field.selectField": "Field type",
  "table.field.searchField": "Search field types…",
  "table.field.noFieldFound": "No field type found.",
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}))

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

describe("FieldTypeSelect", () => {
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

  it("shares categorized descriptions and keyboard selection with Base", async () => {
    const onChange = vi.fn()
    await act(async () => {
      root.render(
        <FieldTypeSelect value={FieldType.Text} onChange={onChange} />
      )
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[role="combobox"]')?.click()
    })
    expect(document.body.textContent).toContain("Basic")
    expect(document.body.textContent).toContain("Advanced")
    expect(document.body.textContent).toContain("System")
    expect(document.body.textContent).toContain(
      "Numeric values with formatting"
    )
    expect(
      document.body
        .querySelector('[data-field-type="created-time"]')
        ?.hasAttribute("data-disabled")
    ).toBe(true)

    const search = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Search field types…"]'
    )
    await act(async () => {
      if (search) setInput(search, "lookup")
      await Promise.resolve()
    })
    await act(async () => {
      search?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
      await Promise.resolve()
    })

    expect(onChange).toHaveBeenCalledWith(FieldType.Lookup)
  })
})
