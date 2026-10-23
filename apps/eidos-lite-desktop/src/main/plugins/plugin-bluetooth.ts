import {
  scanBluetoothDevices,
  type BluetoothDeviceInfo,
} from "@eidos.space/plugin-sandbox"
import type { BackgroundBinding } from "./plugin-background"

export interface BluetoothDialog {
  message: string
  detail: string
  buttons: string[]
}
// Device advertisements are untrusted display text. Always show the exact ID separately.
const label = (value: string) =>
  value
    .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, " ")
    .slice(0, 128)

export async function choosePluginBluetoothDevice(
  binding: BackgroundBinding,
  signal: AbortSignal,
  binaryPath: string,
  show: (dialog: BluetoothDialog) => Promise<number>,
  scan: typeof scanBluetoothDevices = scanBluetoothDevices
): Promise<BluetoothDeviceInfo | null> {
  const permissions = binding.manifest.background?.bluetooth
  if (!permissions) throw new Error("Bluetooth was not declared")
  const check = async () => {
    signal.throwIfAborted()
    await binding.authorize()
    signal.throwIfAborted()
  }
  const prompt = async (dialog: BluetoothDialog) => {
    await check()
    let cancel = () => {}
    const cancelled = new Promise<never>((_, reject) => {
      cancel = () => reject(new Error("Bluetooth selection cancelled"))
      signal.addEventListener("abort", cancel, { once: true })
      if (signal.aborted) cancel()
    })
    let result: number
    try {
      result = await Promise.race([show(dialog), cancelled])
    } finally {
      signal.removeEventListener("abort", cancel)
    }
    await check()
    return result
  }
  const detail = [
    `Plugin: ${label(binding.manifest.name)} (${binding.manifest.id})`,
    "BLE service permissions:",
    ...permissions.services.map(
      (s) =>
        `${s.uuid}: ${["read", "write", "notify"].filter((op) => s[op as "read" | "write" | "notify"]).join(", ")}`
    ),
    `Network origins: ${binding.manifest.background?.networkOrigins?.join(", ") || "None"}`,
    "Only the selected device will be granted. Private network access is not granted.",
    "Confirming a device starts a fresh background and disconnects its previous device. It keeps running when the View closes. Stop or disable the plugin to revoke access.",
  ].join("\n")
  if (
    (await prompt({
      message: "Search for a Bluetooth device?",
      detail:
        detail +
        "\n\nScanning takes about 5 seconds. The operating system may also request Bluetooth permission.",
      buttons: ["Cancel", "Scan"],
    })) !== 1
  )
    return null
  const devices = await scan(binaryPath, signal)
  await check()
  if (!devices.length) {
    await prompt({
      message: "No Bluetooth devices found",
      detail:
        "Put your BLE device into advertising mode and try again. Only BLE GATT devices are supported; system audio output is not part of this interface.",
      buttons: ["Close"],
    })
    return null
  }
  let page = 0
  while (true) {
    const slice = devices.slice(page * 4, page * 4 + 4)
    const more = devices.length > 4
    const index = await prompt({
      message: `Choose a Bluetooth device by number (${page + 1}/${Math.ceil(devices.length / 4)})`,
      detail:
        "Devices may not advertise all their services. A connection can still fail if a required service is unavailable.\n\n" +
        slice
          .map(
            (d, i) =>
              `${i + 1}. ${label(d.name || "Unnamed device")}\nID: ${label(d.id)}`
          )
          .join("\n\n"),
      buttons: [
        "Cancel",
        ...slice.map((_, i) => String(i + 1)),
        ...(more ? ["Next page"] : []),
      ],
    })
    if (index === 0) return null
    if (more && index === slice.length + 1) {
      page = (page + 1) % Math.ceil(devices.length / 4)
      continue
    }
    const device = slice[index - 1]
    if (!device) return null
    if (
      (await prompt({
        message: `Allow access to ${label(device.name || "Unnamed device")}?`,
        detail: `Device ID: ${label(device.id)}\n\n${detail}`,
        buttons: ["Cancel", "Allow and start background"],
      })) !== 1
    )
      return null
    return device
  }
}
