// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { DevicesSettings, PeerSyncPanel } from "./peer-sync-panel"

it("keeps pairing global and offers only current-Space controls in the sidebar", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const peerSync = vi.fn(async () => ({
    running: true,
    serviceRunning: true,
    devices: [{ id: "phone", name: "Phone" }],
    spaces: [{ id: "work", name: "Work" }],
  }))
  const openSettingsDestination = vi.fn()
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: { peerSync, openSettingsDestination },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () => root.render(<PeerSyncPanel standalone />))
    expect(peerSync).toHaveBeenCalledWith("status")
    expect(host.textContent).not.toContain("移除授权")
    expect(host.textContent).not.toContain("配对码")
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "管理设备 ↗")!
        .click()
    )
    expect(openSettingsDestination).toHaveBeenCalledWith("devices")
    await act(async () =>
      host.querySelector<HTMLInputElement>('[role="switch"]')!.click()
    )
    expect(peerSync).toHaveBeenCalledWith("stop", undefined)
    await act(async () => root.render(<DevicesSettings />))
    expect(peerSync).toHaveBeenCalledWith("devices-status")
    expect(host.textContent).toContain("Work")
    expect(host.textContent).toContain("Phone")
    const invite = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "显示配对码"
    )!
    await act(async () => invite.click())
    expect(peerSync).toHaveBeenCalledWith("devices-invite", undefined)
  } finally {
    await act(async () => root.unmount())
  }
})
