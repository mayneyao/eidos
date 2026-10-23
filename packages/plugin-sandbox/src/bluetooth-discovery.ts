import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"

export interface BluetoothDeviceInfo {
  id: string
  name?: string
  services: string[]
}
/** Host-only discovery. Never expose the executable path or scan results to guest code. */
export async function scanBluetoothDevices(
  binaryPath: string,
  signal?: AbortSignal
): Promise<BluetoothDeviceInfo[]> {
  if (!path.isAbsolute(binaryPath))
    throw new Error("Expected absolute sandbox binary path")
  const { stdout } = await promisify(execFile)(
    binaryPath,
    ["bluetooth-scan", "--seconds", "5"],
    {
      signal,
      timeout: 45000,
      maxBuffer: 256 * 1024,
      windowsHide: true,
      encoding: "utf8",
    }
  )
  return parseBluetoothDevices(stdout)
}
export function parseBluetoothDevices(stdout: string): BluetoothDeviceInfo[] {
  if (Buffer.byteLength(stdout) > 256 * 1024)
    throw new Error("Bluetooth scan output too large")
  const devices = new Map<string, BluetoothDeviceInfo>()
  for (const line of stdout.split("\n").filter(Boolean)) {
    const value: unknown = JSON.parse(line)
    if (!value || typeof value !== "object")
      throw new Error("Invalid Bluetooth scan response")
    const device = value as Record<string, unknown>
    if (
      typeof device.id !== "string" ||
      !device.id ||
      device.id.length > 128 ||
      /[\x00-\x1f\x7f]/.test(device.id) ||
      (device.name != null &&
        (typeof device.name !== "string" || device.name.length > 256)) ||
      !Array.isArray(device.services) ||
      device.services.some((s) => typeof s !== "string")
    )
      throw new Error("Invalid Bluetooth scan response")
    devices.set(device.id, {
      id: device.id,
      ...(typeof device.name === "string" ? { name: device.name } : {}),
      services: device.services as string[],
    })
    if (devices.size >= 64) break
  }
  return [...devices.values()]
}
