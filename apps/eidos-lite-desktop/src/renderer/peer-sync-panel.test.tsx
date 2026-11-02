// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { DevicesSettings, PeerSyncPanel } from "./peer-sync-panel"

it("ignores a stale background failure after a sharing action", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  let checks = 0
  let rejectOld!: (error: Error) => void
  const peerSync = vi.fn((action: string) => {
    if (action === "status" && ++checks === 2) {
      return new Promise<never>((_resolve, reject) => {
        rejectOld = reject
      })
    }
    return Promise.resolve({ running: true, serviceRunning: true, devices: [] })
  })
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: { peerSync },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () => root.render(<PeerSyncPanel standalone />))
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[role="switch"]')!.click()
    )
    expect(peerSync).toHaveBeenCalledWith("stop", undefined)
    await act(async () => rejectOld(new Error("Obsolete failure")))
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(
      host.querySelector('[role="switch"]')?.getAttribute("aria-checked")
    ).toBe("true")
  } finally {
    await act(async () => root.unmount())
    vi.useRealTimers()
  }
})

it("clears a recovered status-check error without hiding an action failure", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  let firstCheck = true
  const peerSync = vi.fn(async (action: string) => {
    if (action === "status" && firstCheck) {
      firstCheck = false
      throw new Error("Temporary status error")
    }
    if (action === "start") throw new Error("Could not share this Space")
    return {
      running: action === "devices-status",
      serviceRunning: true,
      devices: [],
    }
  })
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: { peerSync },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () => root.render(<PeerSyncPanel standalone />))
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Temporary status error"
    )
    await act(async () => vi.advanceTimersByTimeAsync(2000))
    expect(host.querySelector('[role="alert"]')).toBeNull()
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[role="switch"]')!.click()
    )
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not share this Space"
    )
    await act(async () => vi.advanceTimersByTimeAsync(2000))
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not share this Space"
    )
  } finally {
    await act(async () => root.unmount())
    vi.useRealTimers()
  }
})

it("offers LAN setup instead of an unusable switch when the service is off", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const peerSync = vi.fn(async () => ({
    running: false,
    serviceRunning: false,
    devices: [],
  }))
  const openSettingsDestination = vi.fn()
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: { peerSync, openSettingsDestination },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () => root.render(<PeerSyncPanel />))
    expect(host.querySelector('[role="switch"]')).toBeNull()
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Set up LAN sync ↗")!
        .click()
    )
    expect(openSettingsDestination).toHaveBeenCalledWith("devices")
    expect(peerSync).toHaveBeenCalledOnce()
    expect(peerSync).toHaveBeenCalledWith("status")
  } finally {
    await act(async () => root.unmount())
  }
})

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

it("shows active LAN transfer bytes without requiring device details", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      peerSync: vi.fn(async () => ({
        running: true,
        serviceRunning: true,
        devices: [{ id: "phone", name: "Phone" }],
        transfers: [
          {
            id: "phone",
            name: "Phone",
            stage: "receiving",
            receivedBytes: 1024,
            sentBytes: 0,
            activeRequests: 1,
            updatedAt: 1000,
          },
        ],
      })),
    },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () => root.render(<PeerSyncPanel standalone />))
    expect(host.querySelector("summary")?.textContent).toContain("1 KiB")
    expect(host.querySelector("summary")?.textContent).not.toContain("%")
    expect(host.querySelector('summary [role="progressbar"]')).not.toBeNull()
  } finally {
    await act(async () => root.unmount())
  }
})

it("offers pairing and current-Space sharing in the sidebar", async () => {
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
    expect(
      host.querySelector('[role="switch"]')?.getAttribute("aria-checked")
    ).toBe("true")
    peerSync.mockClear()
    expect(
      host.querySelector(".peer-sync-devices-heading")?.textContent
    ).toContain("Pair a new device")
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Pair a new device")!
        .click()
    )
    expect(peerSync).toHaveBeenCalledWith("devices-invite", undefined)
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[role="switch"]')!.click()
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

it("shows the pairing invitation and requires explicit approval", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  let invited = false
  let pending = false
  const peerSync = vi.fn(async (action: string) => {
    if (action === "devices-invite") invited = true
    return {
      running: action === "start" || (action.startsWith("devices-") && invited),
      serviceRunning: invited,
      devices: [],
      ...(action === "devices-invite"
        ? { invitation: "test-code", qr: "data:image/png;base64,AA==" }
        : {}),
      ...(pending && action === "devices-status" ? { pending: "Phone" } : {}),
    }
  })
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: { peerSync },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () => root.render(<PeerSyncPanel standalone />))
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[role="switch"]')!.click()
    )
    expect(peerSync).toHaveBeenCalledWith("devices-start", undefined)
    expect(peerSync).toHaveBeenCalledWith("start", undefined)
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Pair a new device")!
        .click()
    )
    expect(host.querySelector('img[alt="Pairing QR code"]')).not.toBeNull()
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Cancel")!
        .click()
    )
    expect(peerSync).toHaveBeenCalledWith("devices-cancel-invite", undefined)
    expect(host.querySelector('img[alt="Pairing QR code"]')).toBeNull()
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Pair a new device")!
        .click()
    )
    pending = true
    await act(async () => vi.advanceTimersByTimeAsync(2000))
    expect(host.textContent).toContain("Phone")
    expect(host.textContent).toContain(
      "It can read and write the Spaces you share."
    )
    expect(peerSync).not.toHaveBeenCalledWith("devices-approve", undefined)
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Allow pairing")!
        .click()
    )
    expect(peerSync).toHaveBeenCalledWith("devices-approve", undefined)
  } finally {
    await act(async () => root.unmount())
    vi.useRealTimers()
  }
})
