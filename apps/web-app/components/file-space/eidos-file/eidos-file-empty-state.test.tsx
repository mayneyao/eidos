// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { EidosFileEmptyState } from "./eidos-file-empty-state"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("EidosFileEmptyState", () => {
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

  it("offers blank, template, and import paths without a modal", async () => {
    const onCreateTemplate = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileEmptyState
          importAction={<button type="button">Import CSV</button>}
          onCreateTemplate={onCreateTemplate}
        />
      )
    })

    expect(container.textContent).toContain("Start this Eidos File")
    expect(container.textContent).toContain("Import CSV")
    expect(container.querySelector('[aria-modal="true"]')).toBeNull()

    const buttons = [...container.querySelectorAll("button")]
    await act(async () => {
      buttons.find((button) => button.textContent === "Blank table")?.click()
      buttons.find((button) => button.textContent === "Task tracker")?.click()
    })
    expect(onCreateTemplate).toHaveBeenNthCalledWith(1, "blank")
    expect(onCreateTemplate).toHaveBeenNthCalledWith(2, "tasks")
  })

  it("keeps a failed template actionable in the empty state", async () => {
    await act(async () => {
      root.render(
        <EidosFileEmptyState
          templateError={{
            template: "tasks",
            message: "The task table could not be created",
          }}
          importAction={<button type="button">Import CSV</button>}
          onCreateTemplate={() => undefined}
        />
      )
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "could not be created"
    )
    expect(container.textContent).toContain("Retry task tracker")
  })
})
