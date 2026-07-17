// @vitest-environment jsdom

import { act, type ForwardedRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"

import { EidosFileFormulaEditor } from "./eidos-file-formula-editor"

vi.mock("@/components/formula-editor/codemirror-editor", async () => {
  const React = await import("react")
  return {
    CodeMirrorFormulaEditor: React.forwardRef(
      (
        props: {
          value: string
          disabled?: boolean
          onChange: (value: string) => void
          onEsc?: () => void
          onSave?: () => void
        },
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
            disabled={props.disabled}
            onChange={(event) => props.onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") props.onEsc?.()
              if ((event.metaKey || event.ctrlKey) && event.key === "s") {
                props.onSave?.()
              }
            }}
          />
        )
      }
    ),
  }
})

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const formulaField: EidosFileFieldInfo = {
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

const sourceFields: EidosFileFieldInfo[] = ["price", "quantity"].map(
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

function submitFormula() {
  document.body
    .querySelector("form")
    ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
}

function changeFormula(value: string) {
  const textarea = document.body.querySelector("textarea")
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )?.set
  valueSetter?.call(textarea, value)
  textarea?.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("EidosFileFormulaEditor", () => {
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
        <EidosFileFormulaEditor
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
      submitFormula()
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledWith({
      formula: "price * quantity",
      displayType: "number",
    })
  })

  it("preserves the draft and local error across a recovery snapshot", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("Formula file is read-only"))
      .mockResolvedValueOnce(undefined)
    const onOpenChange = vi.fn()
    const renderEditor = async (field: EidosFileFieldInfo) => {
      await act(async () => {
        root.render(
          <EidosFileFormulaEditor
            field={field}
            fields={[...sourceFields, field]}
            open
            onOpenChange={onOpenChange}
            onSave={onSave}
          />
        )
      })
    }

    await renderEditor(formulaField)
    await act(async () => changeFormula("price + quantity"))
    await act(async () => {
      submitFormula()
      await Promise.resolve()
    })

    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      "Formula file is read-only"
    )
    expect(onOpenChange).not.toHaveBeenCalled()

    await renderEditor({
      ...formulaField,
      property: { formula: "price", displayType: "number" },
    })
    expect(document.body.querySelector("textarea")?.value).toBe(
      "price + quantity"
    )
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      "Formula file is read-only"
    )

    await act(async () => {
      submitFormula()
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("locks dismissal and duplicate submission while saving", async () => {
    let resolveSave: (() => void) | undefined
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve
        })
    )
    const onOpenChange = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileFormulaEditor
          field={formulaField}
          fields={[...sourceFields, formulaField]}
          open
          onOpenChange={onOpenChange}
          onSave={onSave}
        />
      )
    })

    await act(async () => {
      submitFormula()
      submitFormula()
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector("textarea")?.disabled).toBe(true)
    expect(
      Array.from(document.body.querySelectorAll("button")).find(
        (button) => button.textContent === "Cancel"
      )?.disabled
    ).toBe(true)

    await act(async () => {
      document.body
        .querySelector("textarea")
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        )
    })
    expect(onOpenChange).not.toHaveBeenCalled()

    await act(async () => {
      resolveSave?.()
      await Promise.resolve()
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
