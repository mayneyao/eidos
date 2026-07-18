import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { vi } from "vitest"

const pwa = vi.hoisted(() => ({
  setUpdateAvailable: vi.fn(),
  updateServiceWorker: vi.fn<() => Promise<void>>(),
}))

vi.mock("./pwa-register", () => ({
  useRegisterSW: () => ({
    needRefresh: [true, pwa.setUpdateAvailable],
    updateServiceWorker: pwa.updateServiceWorker,
  }),
}))

import { PwaUpdateController } from "./pwa-update-controller"

describe("PwaUpdateController", () => {
  let container: HTMLDivElement
  let root: Root
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    pwa.setUpdateAvailable.mockReset()
    pwa.updateServiceWorker.mockReset().mockResolvedValue(undefined)
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    warn.mockRestore()
    container.remove()
  })

  it("activates a waiting service worker only after confirmation", async () => {
    act(() => root.render(<PwaUpdateController />))
    expect(pwa.updateServiceWorker).not.toHaveBeenCalled()

    const updateButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Reload to update"
    )!
    await act(async () =>
      updateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    )
    expect(pwa.updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it("keeps the prompt open with a useful error when activation fails", async () => {
    pwa.updateServiceWorker.mockRejectedValueOnce(new Error("offline"))
    act(() => root.render(<PwaUpdateController />))

    const updateButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Reload to update"
    )!
    await act(async () =>
      updateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    )

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Check your connection"
    )
    expect(updateButton.disabled).toBe(false)
  })
})
