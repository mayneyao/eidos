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
