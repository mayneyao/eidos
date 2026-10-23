import { expect, it, vi } from "vitest"
import {
  choosePluginBluetoothDevice,
  type BluetoothDialog,
} from "./plugin-bluetooth"
import type { BackgroundBinding } from "./plugin-background"
const binding: BackgroundBinding = {
  owner: 1,
  space: "space",
  hash: "hash",
  code: "",
  manifest: {
    apiVersion: 1,
    id: "test.ble",
    name: "BLE",
    version: "1.0.0",
    background: {
      entry: "./bg.js",
      bluetooth: {
        services: [{ uuid: "battery_service", read: true, notify: true }],
      },
    },
  },
  authorize: async () => {},
}
const device = { id: "exact-id", name: "Battery", services: [] }
it("does not scan without host consent and requires a separate exact-device confirmation", async () => {
  const scan = vi.fn(async () => [device])
  const show = vi.fn(async (_dialog: BluetoothDialog) => 0)
  expect(
    await choosePluginBluetoothDevice(
      binding,
      new AbortController().signal,
      "/binary",
      show,
      scan
    )
  ).toBeNull()
  expect(scan).not.toHaveBeenCalled()
  show
    .mockResolvedValueOnce(1)
    .mockResolvedValueOnce(1)
    .mockResolvedValueOnce(0)
  expect(
    await choosePluginBluetoothDevice(
      binding,
      new AbortController().signal,
      "/binary",
      show,
      scan
    )
  ).toBeNull()
  expect(show.mock.calls.at(-1)?.[0].detail).toContain("exact-id")
  show.mockResolvedValue(1)
  expect(
    await choosePluginBluetoothDevice(
      binding,
      new AbortController().signal,
      "/binary",
      show,
      scan
    )
  ).toEqual(device)
})
it("rechecks authorization and aborts pending dialogs without granting", async () => {
  const abort = new AbortController()
  const scan = vi.fn(async () => [device])
  const show = vi.fn(() => new Promise<number>(() => {}))
  const selection = choosePluginBluetoothDevice(
    binding,
    abort.signal,
    "/binary",
    show,
    scan
  )
  await vi.waitFor(() => expect(show).toHaveBeenCalled())
  abort.abort()
  await expect(selection).rejects.toThrow("cancelled")
  expect(scan).not.toHaveBeenCalled()
  let active = true
  await expect(
    choosePluginBluetoothDevice(
      {
        ...binding,
        authorize: async () => {
          if (!active) throw new Error("revoked")
        },
      },
      new AbortController().signal,
      "/binary",
      async () => {
        active = false
        return 1
      },
      scan
    )
  ).rejects.toThrow("revoked")
  expect(scan).not.toHaveBeenCalled()
})
