import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"
import { handleMobileBack, useMobileBack } from "./mobile-back"
vi.mock("./context", () => ({
  useEidosFileUI: () => ({ interactionMode: "mobile" }),
}))
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("native mobile back", () => {
  it("dismisses a popup before its record and removes unmounted handlers", async () => {
    const container = document.createElement("div"),
      close = vi.fn()
    const root = createRoot(container)
    function Record() {
      useMobileBack(close)
      return null
    }
    await act(async () => root.render(<Record />))
    const overlay = document.createElement("div")
    overlay.setAttribute("role", "dialog")
    overlay.getClientRects = () => [{ width: 320 }] as unknown as DOMRectList
    document.body.append(overlay)
    const escape = vi.fn()
    document.addEventListener("keydown", escape)
    try {
      expect(handleMobileBack()).toBe(true)
      expect(escape).toHaveBeenCalled()
      expect(close).not.toHaveBeenCalled()
      overlay.remove()
      expect(handleMobileBack()).toBe(true)
      expect(close).toHaveBeenCalledOnce()
      await act(async () => root.unmount())
      expect(handleMobileBack()).toBe(false)
    } finally {
      overlay.remove()
      document.removeEventListener("keydown", escape)
    }
  })
})
