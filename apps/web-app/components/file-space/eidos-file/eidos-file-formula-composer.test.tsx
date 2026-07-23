// @vitest-environment jsdom

import { act, useState, type ForwardedRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileFieldInfo,
  EidosFileFormulaDisplayType,
  EidosFileFormulaPreview,
  EidosFileFormulaPreviewInput,
} from "@eidos.space/eidos-file"

import { EidosFileFormulaComposer } from "./eidos-file-formula-composer"

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

const fields: EidosFileFieldInfo[] = ["price", "quantity"].map(
  (columnName) => ({
    id: `field-${columnName}`,
    tableId: "orders",
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
  })
)

function Harness({
  initialFormula,
  onPreview,
  onValidityChange,
}: {
  initialFormula: string
  onPreview?: (
    input: EidosFileFormulaPreviewInput
  ) => Promise<EidosFileFormulaPreview>
  onValidityChange?: (valid: boolean) => void
}) {
  const [formula, setFormula] = useState(initialFormula)
  const [displayType, setDisplayType] =
    useState<EidosFileFormulaDisplayType>("number")
  return (
    <EidosFileFormulaComposer
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

describe("EidosFileFormulaComposer", () => {
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

  it("validates and previews a draft against real Eidos File rows", async () => {
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
          initialFormula='"Unit price" * "Quantity"'
          onPreview={onPreview}
          onValidityChange={onValidityChange}
        />
      )
    })
    expect(document.body.textContent).toContain(
      "Checking against this Eidos File"
    )
    await act(async () => {
      vi.advanceTimersByTime(350)
      await Promise.resolve()
    })
    expect(onPreview).toHaveBeenCalledWith({
      name: "Total",
      columnName: "total",
      formula: '"Unit price" * "Quantity"',
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
        <Harness initialFormula='"Missing" + 1' onPreview={onPreview} />
      )
    })
    expect(document.body.querySelector('[role="alert"]')?.textContent).toMatch(
      /not found.*Missing/i
    )
    await act(async () => vi.advanceTimersByTime(500))
    expect(onPreview).not.toHaveBeenCalled()
  })

  it("inserts fields from the reusable reference browser", async () => {
    await act(async () => {
      root.render(<Harness initialFormula="" />)
    })
    expect(
      document.body.querySelector(".eidos-file-formula-composer-layout")
    ).not.toBeNull()
    expect(
      document.body.querySelector(".eidos-file-formula-reference-pane")
    ).not.toBeNull()
    expect(
      document.body.querySelector(".eidos-file-formula-display-row")
    ).not.toBeNull()
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
