// @vitest-environment jsdom

import { act, type ForwardedRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { BaseFieldInfo } from "@eidos.space/base"

import { BaseFormulaEditor } from "./base-formula-editor"

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

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const formulaField: BaseFieldInfo = {
  name: "Total",
  type: "formula",
  tableName: "tb_orders",
  tableColumnName: "total",
  property: { formula: "price * quantity", displayType: "number" },
  storageCodec: "scalar",
  valueKind: "derived",
  isHidden: false,
  isDerived: true,
  sourceTableColumnName: null,
  dependsOn: ["price", "quantity"],
}

const sourceFields: BaseFieldInfo[] = ["price", "quantity"].map(
  (columnName) => ({
    ...formulaField,
    name: columnName,
    type: "number",
    tableColumnName: columnName,
    property: null,
    valueKind: "source",
    isDerived: false,
    dependsOn: null,
  })
)

describe("BaseFormulaEditor", () => {
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

  it("updates a formula inside an anchored popover", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    await act(async () => {
      root.render(
        <BaseFormulaEditor
          field={formulaField}
          fields={[...sourceFields, formulaField]}
          open
          onOpenChange={vi.fn()}
          onSave={onSave}
        />
      )
    })
    expect(document.body.querySelector('[aria-modal="true"]')).toBeNull()
    const textarea = document.body.querySelector("textarea")
    expect(textarea?.value).toBe("price * quantity")
    await act(async () => {
      document.body
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        )
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledWith({
      formula: "price * quantity",
      displayType: "number",
    })
  })
})
