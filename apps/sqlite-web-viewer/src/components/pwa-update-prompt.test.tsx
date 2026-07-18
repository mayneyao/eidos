import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { vi } from "vitest"

import { PwaUpdatePrompt, type PwaUpdatePromptProps } from "./pwa-update-prompt"

describe("PwaUpdatePrompt", () => {
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

  function renderPrompt(overrides: Partial<PwaUpdatePromptProps> = {}) {
    const props: PwaUpdatePromptProps = {
      open: true,
      updating: false,
      onDismiss: vi.fn(),
      onUpdate: vi.fn(),
      ...overrides,
    }
    act(() => root.render(<PwaUpdatePrompt {...props} />))
    return props
  }

  it("asks before reloading into a new version", () => {
    const props = renderPrompt()
    expect(container.textContent).toContain("New version ready")
    expect(container.textContent).toContain("local file stays unchanged")

    const updateButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Reload to update"
    )
    expect(updateButton?.disabled).toBe(false)
    act(() =>
      updateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    )
    expect(props.onUpdate).toHaveBeenCalledOnce()
  })

  it("can defer an update and reports activation failures", () => {
    const props = renderPrompt({
      error: "The update could not start.",
    })
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "could not start"
    )

    const laterButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Later"
    )
    act(() =>
      laterButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    )
    expect(props.onDismiss).toHaveBeenCalledOnce()
    expect(props.onUpdate).not.toHaveBeenCalled()
  })
})
