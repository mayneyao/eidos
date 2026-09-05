import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { InlineMathView } from "./view"

describe("inline equation view", () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("edits through a callback without requiring a Lexical editor", () => {
    const save = vi.fn()
    const unregister = vi.fn()
    const register = vi.fn(() => unregister)
    act(() =>
      root.render(
        <InlineMathView
          value="x"
          onSave={save}
          readOnly={false}
          registerDraft={register}
          saveBlockLabel="Done"
        />
      )
    )
    act(() => container.querySelector<HTMLElement>('[role="button"]')!.click())
    const textarea = container.querySelector("textarea")!
    expect(register).toHaveBeenCalledTimes(1)
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )!.set!.call(textarea, "x^2")
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
    })
    act(() => container.querySelector<HTMLButtonElement>("button")!.click())
    expect(save).toHaveBeenCalledWith("x^2")
    expect(unregister).toHaveBeenCalledTimes(1)
    expect(container.querySelector("textarea")).toBeNull()
  })

  it("does not open an editor in read-only mode", () => {
    const register = vi.fn(() => vi.fn())
    act(() =>
      root.render(
        <InlineMathView
          value="x"
          onSave={vi.fn()}
          readOnly
          registerDraft={register}
          saveBlockLabel="Done"
        />
      )
    )
    act(() =>
      container
        .querySelector<HTMLElement>(".eme-efm-math-preview-trigger")!
        .click()
    )
    expect(container.querySelector("textarea")).toBeNull()
    expect(register).not.toHaveBeenCalled()
  })
})
