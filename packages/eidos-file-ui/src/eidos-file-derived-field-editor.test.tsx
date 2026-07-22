// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./eidos-file-formula-input", async () => {
  const React = await import("react")
  interface MockInputProps {
    value: string
    disabled?: boolean
    onChange: (value: string) => void
    onEscape?: () => void
    onSave?: () => void
  }
  const EidosFileFormulaInput = React.forwardRef<
    { focus: () => void; insertText: (text: string) => void },
    MockInputProps
  >(({ value, disabled, onChange, onEscape, onSave }, ref) => {
    const inputRef = React.useRef<HTMLTextAreaElement>(null)
    React.useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      insertText: (text: string) => onChange(`${value}${text}`),
    }))
    return (
      <textarea
        ref={inputRef}
        aria-label="Formula expression"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onEscape?.()
          if ((event.metaKey || event.ctrlKey) && event.key === "s") {
            event.preventDefault()
            onSave?.()
          }
        }}
      />
    )
  })
  EidosFileFormulaInput.displayName = "MockEidosFileFormulaInput"
  return { EidosFileFormulaInput }
})

import { EidosFileFormulaEditorPopover } from "./eidos-file-derived-field-editor"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function field(
  name: string,
  columnName: string,
  type: EidosFileFieldInfo["type"] = "number"
): EidosFileFieldInfo {
  const formula = type === "formula"
  return {
    id:
      type === "formula"
        ? "0198c72d-82b5-7000-8000-000000000002"
        : "0198c72d-82b5-7000-8000-000000000001",
    tableId: "0198c72d-82b5-7000-8000-000000000010",
    name,
    type,
    tableName: "tb_tasks",
    tableColumnName: columnName,
    property: formula
      ? { formula: '"Estimate" * 2', displayType: "number" }
      : null,
    storageCodec: "scalar",
    valueKind: formula ? "derived" : "source",
    isHidden: false,
    isDerived: formula,
    sourceTableColumnName: null,
    dependsOn: formula ? ["estimate"] : null,
  }
}

const estimate = field("Estimate", "estimate")
const total = field("Total", "total", "formula")

function setTextareaValue(input: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )?.set?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("EidosFileFormulaEditorPopover", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("saves with Mod-S through the public editor contract", async () => {
    const onOpenChange = vi.fn()
    const onSave = vi.fn(() => Promise.resolve())
    await act(async () => {
      root.render(
        <EidosFileFormulaEditorPopover
          field={total}
          fields={[estimate, total]}
          open
          onOpenChange={onOpenChange}
          onSave={onSave}
        />
      )
      await Promise.resolve()
    })
    const expression = document.body.querySelector<HTMLTextAreaElement>(
      '[aria-label="Formula expression"]'
    )
    expect(expression?.value).toBe('"Estimate" * 2')

    await act(async () => {
      expression?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "s",
          metaKey: true,
          bubbles: true,
        })
      )
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledWith({
      formula: '"Estimate" * 2',
      displayType: "number",
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("preserves a draft when the host refreshes its field snapshot", async () => {
    const renderEditor = (fields: EidosFileFieldInfo[]) => (
      <EidosFileFormulaEditorPopover
        field={total}
        fields={fields}
        open
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
      />
    )
    await act(async () => {
      root.render(renderEditor([estimate, total]))
      await Promise.resolve()
    })
    const expression = document.body.querySelector<HTMLTextAreaElement>(
      '[aria-label="Formula expression"]'
    )
    if (!expression) throw new Error("Formula expression was not rendered")
    await act(async () => setTextareaValue(expression, '"Estimate" * 3'))
    expect(expression.value).toBe('"Estimate" * 3')

    await act(async () => {
      root.render(
        renderEditor([{ ...estimate, name: "Estimate points" }, total])
      )
      await Promise.resolve()
    })
    expect(expression.value).toBe('"Estimate" * 3')
  })
})
