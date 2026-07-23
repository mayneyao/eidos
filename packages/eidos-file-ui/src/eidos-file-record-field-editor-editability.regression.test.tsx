// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileFieldInfo,
  EidosFileSqlPrimitive,
} from "@eidos.space/eidos-file"

import { EidosFileRecordFieldEditor } from "./eidos-file-record-field-editor"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function field(type: "integer" | "json", column: string): EidosFileFieldInfo {
  return {
    id: `field-${column}`,
    tableId: "table-records",
    name: type === "integer" ? "Exact integer" : "Payload",
    type,
    tableName: "records",
    tableColumnName: column,
    property: null,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }
}

function enterValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value)
  element.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("Record field editor editability regression", () => {
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

  it("preserves an int64 boundary as an exact Integer edit", async () => {
    const changes: EidosFileSqlPrimitive[] = []
    await act(async () => {
      root.render(
        <EidosFileRecordFieldEditor
          field={field("integer", "exact_integer")}
          row={{ _id: "row-1", exact_integer: 0n }}
          disabled={false}
          onChange={async (value) => {
            changes.push(value)
          }}
        />
      )
    })

    const input = container.querySelector<HTMLInputElement>(
      '[aria-label="Exact integer"]'
    )!
    await act(async () => {
      input.focus()
      enterValue(input, "9223372036854775807")
    })
    await act(async () => input.blur())

    expect(changes).toEqual([9_223_372_036_854_775_807n])
  })

  it("canonicalizes JSON edits and treats an empty editor as logical null", async () => {
    const changes: EidosFileSqlPrimitive[] = []
    const payload = field("json", "payload")
    await act(async () => {
      root.render(
        <EidosFileRecordFieldEditor
          field={payload}
          row={{ _id: "row-1", payload: '{"current":true}' }}
          disabled={false}
          onChange={async (value) => {
            changes.push(value)
          }}
        />
      )
    })

    const textarea = container.querySelector<HTMLTextAreaElement>(
      '[aria-label="Payload"]'
    )!
    await act(async () => {
      textarea.focus()
      enterValue(textarea, '{ "z": 2, "a": [true, null] }')
    })
    await act(async () => textarea.blur())
    expect(changes).toEqual(['{"a":[true,null],"z":2}'])

    await act(async () => {
      root.render(
        <EidosFileRecordFieldEditor
          field={payload}
          row={{ _id: "row-1", payload: '{"a":[true,null],"z":2}' }}
          disabled={false}
          onChange={async (value) => {
            changes.push(value)
          }}
        />
      )
    })
    await act(async () => {
      textarea.focus()
      enterValue(textarea, "")
    })
    await act(async () => textarea.blur())

    expect(changes).toEqual(['{"a":[true,null],"z":2}', null])
  })
})
