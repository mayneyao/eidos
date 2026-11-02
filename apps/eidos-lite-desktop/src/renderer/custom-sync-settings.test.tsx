// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { CustomSyncSettings } from "./custom-sync-settings"

it("tests and saves a server without connecting a Space, and can edit it", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const server = {
    id: "one",
    name: "Home",
    origin: "https://example.test",
    credentialAvailable: true,
  }
  const list = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([server])
  const save = vi.fn().mockResolvedValue(server)
  const enableSync = vi.fn()
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      listCustomSyncServers: list,
      saveCustomSyncServer: save,
      getSparkStatus: vi.fn().mockResolvedValue({
        state: "active",
        features: ["custom-graft-sync"],
        licenses: [],
      }),
      enableSync,
    },
  })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const click = (label: string) =>
    [...host.querySelectorAll("button")]
      .find((button) => button.textContent === label)!
      .click()
  const fill = (input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }
  try {
    await act(async () => root.render(<CustomSyncSettings />))
    await act(async () => click("Add server"))
    const inputs = host.querySelectorAll("input")
    await act(async () => {
      fill(inputs[0], "Home")
      fill(inputs[1], "https://example.test")
      fill(inputs[2], "secret")
    })
    await act(async () => click("Test and save"))
    expect(save).toHaveBeenCalledWith({
      name: "Home",
      origin: "https://example.test",
      token: "secret",
    })
    expect(enableSync).not.toHaveBeenCalled()
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Connection saved with system encryption"
    )
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Choose a saved server for this Space."
    )
    expect(host.textContent).toContain("Home")
    await act(async () => click("Edit"))
    expect(
      host.querySelector<HTMLInputElement>('input[type="url"]')?.disabled
    ).toBe(true)
    await act(async () => click("Test and save"))
    expect(save).toHaveBeenLastCalledWith({
      id: "one",
      name: "Home",
      origin: "https://example.test",
    })
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
