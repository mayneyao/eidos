// QuickJS worker: selection and grants belong to Lite; connecting requires a message.
import type { Device, Characteristic } from "./bluetooth-types"
type Command = { command: string; id?: string }
let device: Device | null = null
let battery: Characteristic | null = null
let percent: number | null = null
let phase = "idle"
let failure: string | null = null
let failedAt: string | null = null
const progress = (next: string) => {
  phase = next
  postMessage({ type: "status", ...state() })
}
let queue = Promise.resolve()
const state = () => ({
  id: device?.id ?? null,
  name: device?.name ?? null,
  connected: device?.gatt.connected ?? false,
  percent,
  phase,
  error: failure,
  failedAt,
})
async function disconnect() {
  if (!device?.gatt.connected) return
  const done = new Promise<void>((resolve) =>
    device!.addEventListener("gattserverdisconnected", () => resolve(), {
      once: true,
    })
  )
  device.gatt.disconnect()
  await done
}
async function handle(data: Command) {
  switch (data.command) {
    case "connect": {
      if (device?.gatt.connected && battery && phase === "connected")
        return state()
      failure = null
      failedAt = null
      percent = null
      battery = null
      device =
        (await navigator.bluetooth.getDevices()).find(
          (d) => d.id === data.id
        ) ?? null
      if (!device) throw new Error("The host has not granted this device")
      device.ongattserverdisconnected = () => {
        battery = null
        percent = null
        if (phase !== "failed") phase = "disconnected"
        postMessage({ type: "disconnected", ...state() })
      }
      try {
        progress("connecting")
        const server = await device.gatt.connect()
        progress("services")
        const service = await server.getPrimaryService("battery_service")
        battery = await service.getCharacteristic("battery_level")
        battery.addEventListener("characteristicvaluechanged", (event) => {
          const value = (event.target as Characteristic).value
          if (value?.byteLength) percent = value.getUint8(0)
          postMessage({ type: "battery", ...state() })
        })
        progress("reading")
        const value = await battery.readValue()
        if (!value.byteLength)
          throw new Error("Battery Level returned an empty value")
        if (value.byteLength) percent = value.getUint8(0)
        if (battery.properties.notify || battery.properties.indicate)
          await battery.startNotifications()
        progress("connected")
      } catch (error) {
        failure = String(error)
        failedAt = phase
        phase = "failed"
        postMessage({ type: "status", ...state() })
        await disconnect()
        throw error
      }
      return state()
    }
    case "read": {
      if (!battery) throw new Error("Choose and connect a battery device first")
      const value = await battery.readValue()
      if (value.byteLength) percent = value.getUint8(0)
      return state()
    }
    case "status":
      return state()
    case "disconnect":
      await disconnect()
      return state()
    default:
      throw new Error("Unknown command")
  }
}
globalThis.onmessage = ({
  data: { requestId, data },
}: MessageEvent<{ requestId: string; data: Command }>) => {
  queue = queue.then(async () => {
    try {
      postMessage({ requestId, data: { ok: true, ...(await handle(data)) } })
    } catch (error) {
      postMessage({
        requestId,
        data: { ...state(), ok: false, error: String(error) },
      })
    }
  })
}
