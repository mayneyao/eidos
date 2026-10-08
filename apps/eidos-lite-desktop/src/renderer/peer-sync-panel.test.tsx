// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { DevicesSettings, PeerSyncPanel } from "./peer-sync-panel"

it("shows per-device payloads, stages and expandable failure details", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  let failed = false
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      peerSync: vi.fn(async () => ({
        running: true,
        serviceRunning: true,
        devices: [{ id: "phone", name: "Pixel" }],
        transfers: [
          {
            id: "phone",
            name: "Pixel",
            stage: "receiving",
            receivedBytes: 1048576,
            sentBytes: 2048,
            activeRequests: failed ? 0 : 1,
            updatedAt: 1000,
            error: failed
              ? "Connection closed before transfer finished"
              : undefined,
          },
        ],
      })),
    },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () => root.render(<PeerSyncPanel />))
    expect(host.textContent).toContain("Receiving device changes")
    expect(host.textContent).toContain("1 MiB")
    expect(host.textContent).toContain("2 KiB")
    expect(host.textContent).not.toContain("100%")
    failed = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(host.textContent).toContain("Transfer interrupted")
    expect(host.querySelector("details")?.textContent).toContain(
      "Connection closed before transfer finished"
    )
  } finally {
    await act(async () => root.unmount())
    vi.useRealTimers()
  }
})

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
    expect(host.textContent).not.toContain("Remove access")
    expect(host.textContent).not.toContain("Copy pairing code")
    expect(host.textContent).toContain("LAN sync")
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Manage devices ↗")!
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
      (button) => button.textContent === "Show pairing code"
    )!
    await act(async () => invite.click())
    expect(peerSync).toHaveBeenCalledWith("devices-invite", undefined)
  } finally {
    await act(async () => root.unmount())
  }
})
