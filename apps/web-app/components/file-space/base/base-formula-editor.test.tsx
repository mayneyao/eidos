// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { BaseFieldInfo } from "@eidos.space/base"

import { BaseFormulaEditor } from "./base-formula-editor"

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
          fields={[formulaField]}
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
