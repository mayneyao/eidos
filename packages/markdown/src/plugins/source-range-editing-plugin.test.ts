import { canOpenSourceRangeEditorFromEvent } from "./source-range-editing-plugin"

function eventFrom(target: HTMLElement, init: KeyboardEventInit = {}) {
  let captured: KeyboardEvent | null = null
  target.addEventListener(
    "keydown",
    (event) => {
      captured = event
    },
    { once: true }
  )
  target.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, key: "e", ...init })
  )
  return captured!
}

describe("source-range shortcut guard", () => {
  it.each(["input", "textarea", "select"])(
    "does not open from a focused %s",
    (tagName) => {
      const target = document.createElement(tagName)
      expect(
        canOpenSourceRangeEditorFromEvent(eventFrom(target), false, true)
      ).toBe(false)
    }
  )

  it("does not open from an ordinary contenteditable text surface", () => {
    const target = document.createElement("div")
    target.setAttribute("contenteditable", "true")
    expect(
      canOpenSourceRangeEditorFromEvent(eventFrom(target), false, true)
    ).toBe(false)
  })

  it("allows the editor root only for a node selection", () => {
    const target = document.createElement("div")
    target.setAttribute("contenteditable", "true")
    target.className = "eme-content-editable"
    const event = eventFrom(target)
    expect(canOpenSourceRangeEditorFromEvent(event, false, true)).toBe(true)
    expect(canOpenSourceRangeEditorFromEvent(event, false, false)).toBe(false)
  })

  it("stays inactive during DOM or editor composition", () => {
    const target = document.createElement("div")
    target.className = "eme-content-editable"
    expect(
      canOpenSourceRangeEditorFromEvent(
        eventFrom(target, { isComposing: true }),
        false,
        true
      )
    ).toBe(false)
    expect(
      canOpenSourceRangeEditorFromEvent(eventFrom(target), true, true)
    ).toBe(false)
  })
})
