// @vitest-environment jsdom

import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EidosFileFormulaComposer } from "./eidos-file-formula-composer"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function field(name: string, columnName: string): EidosFileFieldInfo {
  return {
    id: `0198c72d-82b5-7000-8000-${columnName.length.toString().padStart(12, "0")}`,
    tableId: "0198c72d-82b5-7000-8000-000000000010",
    name,
    type: "number",
    tableName: "tb_tasks",
    tableColumnName: columnName,
    property: null,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }
}

const fields = [
  field("Estimate", "estimate"),
  field("Unit price", "unit_price"),
]

function ComposerHarness({ initialFormula = '"Estimate" * 2' }) {
  const [formula, setFormula] = useState(initialFormula)
  return (
    <>
      <output data-formula-value>{formula}</output>
      <EidosFileFormulaComposer
        field={null}
        fields={fields}
        name="Total"
        columnName="total"
        formula={formula}
        displayType="number"
        onFormulaChange={setFormula}
        onDisplayTypeChange={vi.fn()}
      />
    </>
  )
}

describe("EidosFileFormulaComposer", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    )
    vi.stubGlobal("cancelAnimationFrame", (handle: number) =>
      window.clearTimeout(handle)
    )
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperties(Range.prototype, {
      getBoundingClientRect: {
        configurable: true,
        value: () => new DOMRect(),
      },
      getClientRects: {
        configurable: true,
        value: () => [],
      },
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it("matches the original editor hierarchy and validates locally", async () => {
    await act(async () => {
      root.render(<ComposerHarness />)
      await Promise.resolve()
    })

    expect(container.querySelector(".cm-editor")).not.toBeNull()
    expect(
      container.querySelector(".eidos-file-formula-reference-browser")
    ).not.toBeNull()
    expect(container.textContent).toContain("Formula is valid. Uses Estimate.")
    expect(container.textContent).toContain("Fields & functions")
    expect(container.textContent).toContain("Reference")
    const displayType = container.querySelector<HTMLButtonElement>(
      ".eidos-file-formula-display-select"
    )
    expect(
      displayType?.querySelector('[data-eidos-file-field-type-icon="number"]')
    ).toBeTruthy()
    await act(async () => displayType?.click())
    const textOption = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]')
    ).find((option) => option.textContent?.trim() === "Text")
    expect(
      textOption?.querySelector('[data-eidos-file-field-type-icon="text"]')
    ).toBeTruthy()
  })

  it("inserts fields and functions from the reference browser", async () => {
    await act(async () => {
      root.render(<ComposerHarness initialFormula="" />)
      await Promise.resolve()
    })

    const unitPrice = container.querySelector<HTMLButtonElement>(
      '[data-formula-reference="field:tb_tasks:unit_price"]'
    )
    await act(async () => unitPrice?.click())
    expect(container.querySelector("[data-formula-value]")?.textContent).toBe(
      '"Unit price"'
    )

    const substr = container.querySelector<HTMLButtonElement>(
      '[data-formula-reference="function:substr"]'
    )
    await act(async () => substr?.click())
    expect(container.querySelector("[data-formula-value]")?.textContent).toBe(
      '"Unit price"SUBSTR()'
    )
    expect(container.textContent).toContain(
      "Returns a one-based SQLite substring; negative values are supported."
    )
  })

  it("keeps parse errors visible for recovery", async () => {
    await act(async () => {
      root.render(<ComposerHarness initialFormula="randomblob(100)" />)
      await Promise.resolve()
    })

    expect(
      container.querySelector('[data-eidos-file-formula-status="error"]')
        ?.textContent
    ).toContain("Unsupported Eidos File formula function: randomblob")
  })
})
