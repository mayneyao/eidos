import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { EidosFileEditorShell } from "./eidos-file-editor-shell"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("EidosFileEditorShell", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("owns the canonical editor hierarchy and workbar order", () => {
    act(() => {
      root.render(
        <EidosFileEditorShell
          viewTabs={<div data-slot="views">Views</div>}
          queryToolbar={<div data-slot="query">Query</div>}
          fields={<button data-slot="fields">Fields</button>}
          fieldCreator={<div data-slot="creator">Creator</div>}
          banner={<div data-slot="banner">Banner</div>}
          sheetTabs={<div data-slot="sheets">Sheets</div>}
          overlays={<div data-slot="overlays">Overlays</div>}
        >
          <div data-slot="content">Grid</div>
        </EidosFileEditorShell>
      )
    })

    const shell = container.querySelector("[data-eidos-file-editor-shell]")
    const workbar = shell?.querySelector("[data-eidos-file-workbar]")
    const actions = workbar?.querySelector("[data-eidos-file-workbar-actions]")
    const fieldActions = actions?.querySelector(
      "[data-eidos-file-field-actions]"
    )

    expect(workbar?.firstElementChild?.getAttribute("data-slot")).toBe("views")
    expect(actions?.children[0]?.getAttribute("data-slot")).toBe("query")
    expect(actions?.children[1]).toBe(fieldActions)
    expect(fieldActions?.children[0]?.getAttribute("data-slot")).toBe("fields")
    expect(fieldActions?.children[1]?.getAttribute("data-slot")).toBe("creator")
    expect(fieldActions?.classList.contains("relative")).toBe(true)
    expect(
      Array.from(shell?.children ?? []).map((child) =>
        child.getAttribute("data-slot")
      )
    ).toEqual([null, "banner", null, "sheets", "overlays"])
    expect(shell?.querySelector("[data-slot='content']")?.textContent).toBe(
      "Grid"
    )
  })

  it("keeps an empty host aligned without inventing host-only controls", () => {
    act(() => {
      root.render(
        <EidosFileEditorShell>
          <div role="status">Start this Eidos File</div>
        </EidosFileEditorShell>
      )
    })

    const workbar = container.querySelector("[data-eidos-file-workbar]")
    expect(workbar?.firstElementChild?.classList.contains("flex-1")).toBe(true)
    expect(workbar?.querySelector("[data-eidos-file-field-actions]")).toBeNull()
    expect(container.querySelector("[role='status']")?.textContent).toContain(
      "Start this Eidos File"
    )
  })
})
