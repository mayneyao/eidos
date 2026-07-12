// @vitest-environment jsdom

import { act, useState, type ForwardedRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  BaseFieldInfo,
  BaseFormulaDisplayType,
  BaseFormulaPreview,
  BaseFormulaPreviewInput,
} from "@eidos.space/base"

import { BaseFormulaComposer } from "./base-formula-composer"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

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

const fields: BaseFieldInfo[] = ["price", "quantity"].map((columnName) => ({
  name: columnName === "price" ? "Unit price" : "Quantity",
  type: "number",
  tableName: "tb_orders",
  tableColumnName: columnName,
  property: null,
  storageCodec: "scalar",
  valueKind: "source",
  isHidden: false,
  isDerived: false,
  sourceTableColumnName: null,
  dependsOn: null,
}))

function Harness({
  initialFormula,
  onPreview,
  onValidityChange,
}: {
  initialFormula: string
  onPreview?: (input: BaseFormulaPreviewInput) => Promise<BaseFormulaPreview>
  onValidityChange?: (valid: boolean) => void
}) {
  const [formula, setFormula] = useState(initialFormula)
  const [displayType, setDisplayType] =
    useState<BaseFormulaDisplayType>("number")
  return (
    <BaseFormulaComposer
      field={null}
      fields={fields}
      name="Total"
      columnName="total"
      formula={formula}
      displayType={displayType}
      onFormulaChange={setFormula}
      onDisplayTypeChange={setDisplayType}
      onPreview={onPreview}
      onValidityChange={onValidityChange}
    />
  )
}

describe("BaseFormulaComposer", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it("validates and previews a draft against real Base rows", async () => {
    const onValidityChange = vi.fn()
    const onPreview = vi.fn().mockResolvedValue({
      expression: "price * quantity",
      dependencies: [
        { name: "Unit price", columnName: "price" },
        { name: "Quantity", columnName: "quantity" },
      ],
      samples: [{ rowId: "row_1", title: "Keyboard", value: 100 }],
    })
    await act(async () => {
      root.render(
        <Harness
          initialFormula="price * quantity"
          onPreview={onPreview}
          onValidityChange={onValidityChange}
        />
      )
    })
    expect(document.body.textContent).toContain("Checking against this Base")
    await act(async () => {
      vi.advanceTimersByTime(350)
      await Promise.resolve()
    })
    expect(onPreview).toHaveBeenCalledWith({
      name: "Total",
      columnName: "total",
      formula: "price * quantity",
      displayType: "number",
    })
    expect(document.body.textContent).toContain("Formula is valid")
    expect(document.body.textContent).toContain("Keyboard")
    expect(document.body.textContent).toContain("100")
    expect(onValidityChange).toHaveBeenLastCalledWith(true)
    expect(document.body.querySelector('[aria-modal="true"]')).toBeNull()
  })

  it("rejects unknown fields before issuing a Desktop preview", async () => {
    const onPreview = vi.fn()
    await act(async () => {
      root.render(
        <Harness initialFormula="missing + 1" onPreview={onPreview} />
      )
    })
    expect(document.body.querySelector('[role="alert"]')?.textContent).toMatch(
      /not found: missing/i
    )
    await act(async () => vi.advanceTimersByTime(500))
    expect(onPreview).not.toHaveBeenCalled()
  })

  it("inserts fields from the reusable reference browser", async () => {
    await act(async () => {
      root.render(<Harness initialFormula="" />)
    })
    const price = [...document.body.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("priceUnit price")
    )
    await act(async () => price?.click())
    expect(
      document.body.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Formula expression"]'
      )?.value
    ).toBe("price")
  })
})
