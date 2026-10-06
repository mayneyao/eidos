// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { SyncTransportTabs } from "./sync-transport-tabs"

it("separates transports while preserving setup input and keyboard navigation", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(window, "eidosLite", { configurable: true, value: {} })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <SyncTransportTabs>
          <input aria-label="Cloud setup" defaultValue="draft" />
        </SyncTransportTabs>
      )
    )
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    const device = host.querySelector<HTMLElement>(".sync-transport-device")!
    const cloud = host.querySelector<HTMLElement>(".sync-transport-cloud")!
    const input = host.querySelector<HTMLInputElement>(
      '[aria-label="Cloud setup"]'
    )!
    expect(tabs[0].textContent).toBe("云同步")
    expect(tabs[1].textContent).toBe("局域网同步")
    expect(device.hidden).toBe(true)
    expect(cloud.hidden).toBe(false)
    input.value = "unfinished setup"
    expect(device.hidden).toBe(true)
    expect(cloud.hidden).toBe(false)
    await act(async () =>
      tabs[0].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
      )
    )
    expect(document.activeElement).toBe(tabs[1])
    expect(cloud.hidden).toBe(true)
    await act(async () =>
      tabs[1].dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true })
      )
    )
    expect(document.activeElement).toBe(tabs[0])
    expect(cloud.hidden).toBe(false)
    expect(host.querySelector('[aria-label="Cloud setup"]')).toBe(input)
    expect(input.value).toBe("unfinished setup")
    await act(async () =>
      tabs[0].dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true })
      )
    )
    expect(document.activeElement).toBe(tabs[1])
    expect(device.hidden).toBe(false)
    await act(async () =>
      root.render(
        <SyncTransportTabs reviewRequired reviewLabel="Resolve merge conflicts">
          <input aria-label="Cloud setup" defaultValue="draft" />
        </SyncTransportTabs>
      )
    )
    expect(tabs[0].textContent).toBe("Resolve merge conflicts")
    expect(tabs[0].getAttribute("aria-selected")).toBe("true")
    expect(host.querySelector('[aria-label="Cloud setup"]')).toBe(input)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
