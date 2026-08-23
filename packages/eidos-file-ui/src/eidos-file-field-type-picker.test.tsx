// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { EidosFileFieldTypePicker } from "./eidos-file-field-type-picker"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
)
Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value() {},
})

describe("EidosFileFieldTypePicker", () => {
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

  it("filters by search and commits the highlighted option with Enter", async () => {
    const changes: string[] = []
    await act(async () => {
      root.render(
        <EidosFileFieldTypePicker
          value="text"
          onChange={(value) => changes.push(value)}
        />
      )
    })

    const trigger = container.querySelector<HTMLElement>(
      "[data-eidos-file-field-type-trigger]"
    )!
    await act(async () => trigger.click())

    const search = document.body.querySelector<HTMLInputElement>(
      '[cmdk-input-wrapper=""] input'
    )!
    expect(search).toBeTruthy()
    expect(
      document.body.querySelectorAll('[role="option"]').length
    ).toBeGreaterThan(10)

    const prototype = HTMLInputElement.prototype
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
        search,
        "aggregate"
      )
      search.dispatchEvent(new Event("input", { bubbles: true }))
    })

    const visible = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]')
    ).filter((option) => !option.hasAttribute("hidden"))
    expect(visible.map((option) => option.textContent)).toEqual([
      expect.stringContaining("Lookup / rollup"),
    ])

    await act(async () => {
      search.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    })
    expect(changes).toEqual(["lookup"])
    expect(
      document.body.querySelector('[data-eidos-file-field-type="lookup"]')
    ).toBeNull()
  })

  it("limits the picker to field types supported by its caller", async () => {
    await act(async () => {
      root.render(
        <EidosFileFieldTypePicker
          value="text"
          allowedTypes={["text", "file"]}
          onChange={vi.fn()}
        />
      )
    })

    const trigger = container.querySelector<HTMLElement>(
      "[data-eidos-file-field-type-trigger]"
    )!
    await act(async () => trigger.click())

    expect(document.body.querySelectorAll('[role="option"]')).toHaveLength(2)
    expect(
      document.body.querySelector('[data-eidos-file-field-type="formula"]')
    ).toBeNull()
  })
})
