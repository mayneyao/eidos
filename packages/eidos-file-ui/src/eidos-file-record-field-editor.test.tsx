// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"

import { EidosFileUIProvider } from "./context"
import { EidosFileRecordFieldEditor } from "./eidos-file-record-field-editor"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function optionField(type: "select" | "multi-select"): EidosFileFieldInfo {
  return {
    id: `field-${type}`,
    tableId: "table-tasks",
    name: type === "select" ? "Status" : "Tags",
    type,
    tableName: "tasks",
    tableColumnName: type === "select" ? "status" : "tags",
    property: {
      options: [
        { name: "Todo", color: "blue" },
        { name: "Done", color: "green" },
      ],
    },
    storageCodec: type === "select" ? "scalar" : "json_array",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }
}

function datetimeField(): EidosFileFieldInfo {
  return {
    ...optionField("select"),
    id: "field-scheduled-at",
    name: "Scheduled at",
    type: "datetime",
    tableColumnName: "scheduled_at",
    property: null,
  }
}

function checkboxField(nullable: boolean): EidosFileFieldInfo {
  return {
    ...optionField("select"),
    id: "field-done",
    name: "Done",
    type: "checkbox",
    tableColumnName: "done",
    property: null,
    nullable,
  }
}

function numberField(): EidosFileFieldInfo {
  return {
    ...optionField("select"),
    id: "field-score",
    name: "Score",
    type: "number",
    tableColumnName: "score",
    property: null,
  }
}

function enterInputValue(element: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set?.call(element, value)
  element.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("EidosFileRecordFieldEditor option presentation", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("keeps a single-select option color in its selected value and menu", async () => {
    await act(async () => {
      root.render(
        <EidosFileRecordFieldEditor
          field={optionField("select")}
          row={{ id: "row-1", status: "Done" }}
          disabled={false}
          onChange={() => Promise.resolve()}
        />
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[role="combobox"]'
    )
    expect(
      trigger?.querySelector('[data-eidos-file-option-color="green"]')
    ).toBeTruthy()
    await act(async () => trigger?.click())
    expect(
      document.body.querySelector('[data-eidos-file-option-color="blue"]')
    ).toBeTruthy()
  })

  it("renders every selected multi-select value as a colored option chip", async () => {
    await act(async () => {
      root.render(
        <EidosFileRecordFieldEditor
          field={optionField("multi-select")}
          row={{ id: "row-1", tags: JSON.stringify(["Todo", "Done"]) }}
          disabled={false}
          onChange={() => Promise.resolve()}
        />
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Tags"]'
    )
    expect(
      trigger?.querySelectorAll("[data-eidos-file-option-color]")
    ).toHaveLength(2)
    expect(
      trigger?.querySelector('[data-eidos-file-option-color="blue"]')
    ).toBeTruthy()
    expect(
      trigger?.querySelector('[data-eidos-file-option-color="green"]')
    ).toBeTruthy()
  })

  it("edits nullable Checkbox values without collapsing NULL into false", async () => {
    const onChange = vi.fn(async () => undefined)
    await act(async () => {
      root.render(
        <EidosFileRecordFieldEditor
          field={checkboxField(true)}
          row={{ id: "row-1", done: null }}
          disabled={false}
          onChange={onChange}
        />
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Done"]'
    )
    expect(trigger?.textContent).toContain("Empty")
    await act(async () => trigger?.click())
    const checked = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]')
    ).find((option) => option.textContent?.trim() === "Checked")
    await act(async () => checked?.click())
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it("does not offer NULL for a non-nullable Checkbox", async () => {
    await act(async () => {
      root.render(
        <EidosFileRecordFieldEditor
          field={checkboxField(false)}
          row={{ id: "row-1", done: 0 }}
          disabled={false}
          onChange={() => Promise.resolve()}
        />
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Done"]'
    )
    await act(async () => trigger?.click())
    expect(
      Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="option"]')
      ).some((option) => option.textContent?.trim() === "Empty")
    ).toBe(false)
  })

  it("preserves an invalid Number draft instead of clearing the Field", async () => {
    const onChange = vi.fn(async () => undefined)
    await act(async () => {
      root.render(
        <EidosFileRecordFieldEditor
          field={numberField()}
          row={{ id: "row-1", score: 12 }}
          disabled={false}
          onChange={onChange}
        />
      )
    })

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Score"]'
    )!
    expect(input.type).toBe("text")
    await act(async () => {
      input.focus()
      enterInputValue(input, "not-a-number")
      input.blur()
      await Promise.resolve()
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(input.value).toBe("not-a-number")
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(container.textContent).toContain("Enter a finite number.")

    await act(async () => {
      input.focus()
      enterInputValue(input, "12.5")
      input.blur()
      await Promise.resolve()
    })
    expect(onChange).toHaveBeenCalledWith(12.5)
  })

  it("edits date-time values in the Host-selected time zone", async () => {
    const onChange = vi.fn(async () => undefined)
    await act(async () => {
      root.render(
        <EidosFileUIProvider timeZone="America/Los_Angeles">
          <EidosFileRecordFieldEditor
            field={datetimeField()}
            row={{
              id: "row-1",
              scheduled_at: "2026-01-01T00:30:00.000Z",
            }}
            disabled={false}
            onChange={onChange}
          />
        </EidosFileUIProvider>
      )
    })

    const input = container.querySelector<HTMLInputElement>(
      'input[type="datetime-local"]'
    )!
    expect(input.value).toBe("2025-12-31T16:30")
    expect(container.textContent).toContain("America/Los_Angeles")
    await act(async () => {
      input.focus()
      enterInputValue(input, "2025-12-31T17:30")
      input.blur()
      await Promise.resolve()
    })
    expect(onChange).toHaveBeenCalledWith("2026-01-01T01:30:00.000Z")
  })
})
