import { randomUUID } from "node:crypto"
import {
  scanBluetoothDevices,
  type BluetoothDeviceInfo,
} from "@eidos.space/plugin-sandbox"
import type { BackgroundBinding } from "./plugin-background"
import type { BluetoothPickerState } from "../../shared/plugins"

const label = (value: string) =>
  value
    .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, " ")
    .slice(0, 128)

export class PluginBluetoothPicker {
  private pending = new Map<
    number,
    {
      state: BluetoothPickerState
      action(action: unknown, deviceId: unknown): Promise<void>
      cancel(): void
    }
  >()
  constructor(
    private send: (owner: number, state: BluetoothPickerState | null) => void,
    private scan: typeof scanBluetoothDevices = scanBluetoothDevices
  ) {}
  action(owner: number, id: unknown, action: unknown, deviceId?: unknown) {
    const pending = this.pending.get(owner)
    if (!pending || pending.state.id !== id)
      throw new Error("Bluetooth selection expired")
    return pending.action(action, deviceId)
  }
  cancel(owner: number) {
    this.pending.get(owner)?.cancel()
  }
  async choose(
    binding: BackgroundBinding,
    signal: AbortSignal,
    binary: string
  ): Promise<BluetoothDeviceInfo | null> {
    const permissions = binding.manifest.background?.bluetooth
    if (!permissions) throw new Error("Bluetooth was not declared")
    await binding.authorize()
    signal.throwIfAborted()
    if (this.pending.has(binding.owner))
      throw new Error("A Bluetooth selection is already open")
    return new Promise((resolve, reject) => {
      const scanAbort = new AbortController()
      let done = false
      let devices: BluetoothDeviceInfo[] = []
      const state: BluetoothPickerState = {
        id: randomUUID(),
        pluginName: label(binding.manifest.name),
        pluginId: binding.manifest.id,
        allServices: permissions === true,
        services:
          permissions === true
            ? []
            : permissions.services.map(
                (s) =>
                  s.uuid +
                  ": " +
                  ["read", "write", "notify"]
                    .filter(
                      (op) =>
                        (s.read === undefined &&
                          s.write === undefined &&
                          s.notify === undefined) ||
                        s[op as "read" | "write" | "notify"]
                    )
                    .join(", ")
              ),
        networkOrigins:
          binding.manifest.background?.networkOrigins ??
          (binding.manifest.background?.network ? ["*"] : []),
        scanning: false,
        scanned: false,
        devices: [],
      }
      const finish = (device: BluetoothDeviceInfo | null, error?: unknown) => {
        if (done) return
        done = true
        scanAbort.abort()
        signal.removeEventListener("abort", abort)
        this.pending.delete(binding.owner)
        this.send(binding.owner, null)
        if (error) reject(error)
        else resolve(device)
      }
      const abort = () =>
        finish(null, new Error("Bluetooth selection cancelled"))
      const check = async () => {
        signal.throwIfAborted()
        await binding.authorize()
        signal.throwIfAborted()
        if (done) throw new Error("Bluetooth selection expired")
      }
      this.pending.set(binding.owner, {
        state,
        cancel: () => finish(null),
        action: async (action, deviceId) => {
          if (action === "cancel") {
            finish(null)
            return
          }
          try {
            await check()
            if (action === "select") {
              if (state.scanning) throw new Error("Wait for scanning to finish")
              const device = devices.find((d) => d.id === deviceId)
              if (!device) throw new Error("Choose a discovered device")
              finish(device)
            } else if (action === "scan" && !state.scanning) {
              state.scanning = true
              state.error = undefined
              this.send(binding.owner, { ...state })
              try {
                const found = await this.scan(binary, scanAbort.signal)
                await check()
                devices = found
                state.devices = found.map((d) => ({
                  id: d.id,
                  name: d.name ? label(d.name) : null,
                }))
                state.scanned = true
              } catch (error) {
                if (!done)
                  state.error =
                    error instanceof Error ? error.message : String(error)
              } finally {
                state.scanning = false
                if (!done) this.send(binding.owner, { ...state })
              }
            }
          } catch (error) {
            finish(null, error)
          }
        },
      })
      signal.addEventListener("abort", abort, { once: true })
      if (signal.aborted) abort()
      else this.send(binding.owner, state)
    })
  }
}
