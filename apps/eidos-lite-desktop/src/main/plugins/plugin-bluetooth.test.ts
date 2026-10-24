import { expect, it, vi, type Mock } from "vitest"
import type { scanBluetoothDevices } from "@eidos.space/plugin-sandbox"
import { PluginBluetoothPicker } from "./plugin-bluetooth"
import type { BackgroundBinding } from "./plugin-background"
import type { BluetoothPickerState } from "../../shared/plugins"
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
function setup(
  scan: Mock<typeof scanBluetoothDevices> = vi.fn(async () => [device])
) {
  const send =
    vi.fn<(owner: number, state: BluetoothPickerState | null) => void>()
  const picker = new PluginBluetoothPicker(send, scan)
  const abort = new AbortController()
  const result = picker.choose(binding, abort.signal, "/binary")
  const ready = async () => {
    await vi.waitFor(() => expect(send).toHaveBeenCalled())
    return send.mock.calls[0][1]!.id
  }
  return { picker, abort, result, ready, scan, send }
}
it("scans only on user action and grants the exact host-owned device", async () => {
  const s = setup()
  const id = await s.ready()
  expect(s.scan).not.toHaveBeenCalled()
  expect(() => s.picker.action(2, id, "scan")).toThrow("expired")
  expect(() => s.picker.action(1, "stale", "scan")).toThrow("expired")
  await s.picker.action(1, id, "scan")
  await s.picker.action(1, id, "select", device.id)
  expect(await s.result).toEqual(device)
  expect(s.send.mock.calls.at(-1)?.[1]).toBeNull()
})
it("rejects forged selections and rechecks revoked authorization", async () => {
  const s = setup()
  const id = await s.ready()
  const rejected = expect(s.result).rejects.toThrow("discovered")
  await s.picker.action(1, id, "select", "forged")
  await rejected
  let active = true
  const send = vi.fn()
  const picker = new PluginBluetoothPicker(send)
  const result = picker.choose(
    {
      ...binding,
      authorize: async () => {
        if (!active) throw new Error("revoked")
      },
    },
    new AbortController().signal,
    "/binary"
  )
  await vi.waitFor(() => expect(send).toHaveBeenCalled())
  active = false
  const revoked = expect(result).rejects.toThrow("revoked")
  await picker.action(1, send.mock.calls[0][1].id, "scan")
  await revoked
})
it("cancels in-flight scans and ignores late results", async () => {
  let finish!: (devices: (typeof device)[]) => void
  const s = setup(
    vi.fn(
      () =>
        new Promise<(typeof device)[]>((resolve) => {
          finish = resolve
        })
    )
  )
  const id = await s.ready()
  const scanning = s.picker.action(1, id, "scan")
  await vi.waitFor(() => expect(s.scan).toHaveBeenCalled())
  await s.picker.action(1, id, "cancel")
  expect(await s.result).toBeNull()
  expect(s.scan.mock.calls[0]?.[1]?.aborted).toBe(true)
  const count = s.send.mock.calls.length
  finish([device])
  await scanning
  expect(s.send).toHaveBeenCalledTimes(count)
})
it("aborts pending selection and allows scan failures to be retried", async () => {
  const s = setup(
    vi
      .fn()
      .mockRejectedValueOnce(new Error("Radio unavailable"))
      .mockResolvedValue([device])
  )
  const id = await s.ready()
  await s.picker.action(1, id, "scan")
  expect(s.send.mock.calls.at(-1)?.[1]?.error).toBe("Radio unavailable")
  await s.picker.action(1, id, "scan")
  expect(s.send.mock.calls.at(-1)?.[1]?.devices).toEqual([
    { id: device.id, name: device.name },
  ])
  const rejected = expect(s.result).rejects.toThrow("cancelled")
  s.abort.abort()
  await rejected
})
