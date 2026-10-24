// @vitest-environment jsdom
import { act, StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import { PluginBluetoothPicker } from "./plugin-bluetooth-picker"
import type { BluetoothPickerState } from "../shared/plugins"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
it("requires a selection, preserves it across scans, and cancels with Escape", async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
  let listener!: (state: BluetoothPickerState | null) => void
  const action = vi.fn().mockResolvedValue(undefined)
  Object.assign(window, {
    eidosLite: {
      onBluetoothPicker: (callback: typeof listener) => {
        listener = callback
        return () => {}
      },
      bluetoothPickerAction: action,
    },
  })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const state: BluetoothPickerState = {
    id: "selection",
    pluginName: "Battery",
    pluginId: "test.battery",
    services: ["battery_service: read"],
    networkOrigins: [],
    scanning: false,
    scanned: true,
    devices: [{ id: "device", name: "Sensor" }],
  }
  try {
    await act(async () =>
      root.render(
        <StrictMode>
          <PluginBluetoothPicker />
        </StrictMode>
      )
    )
    await act(async () => listener({ ...state, scanned: false, devices: [] }))
    expect(action.mock.calls.filter((call) => call[1] === "scan")).toHaveLength(
      1
    )
    await act(async () => listener(state))
    const confirm = () =>
      container.querySelector<HTMLButtonElement>(".bluetooth-confirm")!
    expect(confirm().disabled).toBe(true)
    await act(async () =>
      container.querySelector<HTMLInputElement>("input[type=radio]")!.click()
    )
    expect(confirm().disabled).toBe(false)
    await act(async () => listener({ ...state, scanning: true }))
    expect(confirm().disabled).toBe(true)
    await act(async () => listener(state))
    expect(confirm().disabled).toBe(false)
    await act(async () => confirm().click())
    expect(action).toHaveBeenCalledWith("selection", "select", "device")
    await act(async () =>
      container
        .querySelector("dialog")!
        .dispatchEvent(new Event("cancel", { cancelable: true }))
    )
    expect(action).toHaveBeenCalledWith("selection", "cancel", "device")
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
