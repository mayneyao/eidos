import { randomUUID } from "node:crypto"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  startBackground,
  type PluginBackground,
  type JsonValue,
  type BluetoothDeviceInfo,
} from "@eidos.space/plugin-sandbox"
import type { PluginManifest } from "@eidos.space/plugin-sdk"
import { PluginError } from "@eidos.space/plugin-runtime/rpc"

interface Entry {
  owner: number
  space: string
  plugin: string
  hash: string
  abort: AbortController
  ready: Promise<PluginBackground>
}
export interface BackgroundBinding {
  owner: number
  space: string
  hash: string
  manifest: PluginManifest
  code: string
  authorize(): Promise<void>
}

/** Host-owned processes; view disposal does not end a background. */
export class PluginBackgroundHost {
  private entries = new Map<string, Entry>()
  private closed = false
  private selections = new Map<
    string,
    {
      binding: BackgroundBinding
      abort: AbortController
      promise: Promise<JsonValue>
    }
  >()
  private pending = new Map<PluginBackground, Set<(error: Error) => void>>()
  constructor(
    private binaryPath: string,
    private approve: (binding: BackgroundBinding) => Promise<boolean>,
    private options: {
      chooseDevice?: (
        binding: BackgroundBinding,
        signal: AbortSignal
      ) => Promise<BluetoothDeviceInfo | null>
      /** Tests only; Lite never enables this. */
      bluetoothMock?: boolean
      /** Trusted development host only; exact ws://127.0.0.1 origin. */
      loopbackOrigin?: string
    } = {}
  ) {}
  private key(binding: BackgroundBinding) {
    return JSON.stringify([binding.owner, binding.space, binding.manifest.id])
  }
  async start(binding: BackgroundBinding): Promise<PluginBackground> {
    await binding.authorize()
    if (this.closed) throw new Error("Background host is closed")
    const key = this.key(binding)
    const existing = this.entries.get(key)
    if (existing && !existing.abort.signal.aborted) return this.create(binding)
    const selection = this.selections.get(key)
    if (selection) {
      await selection.promise
      return this.start(binding)
    }
    return this.create(binding)
  }
  private create(
    binding: BackgroundBinding,
    device?: BluetoothDeviceInfo
  ): Promise<PluginBackground> {
    const key = this.key(binding)
    const existing = this.entries.get(key)
    if (existing) {
      if (existing.hash !== binding.hash)
        throw new Error("Background revision changed")
      return existing.ready
    }
    const abort = new AbortController()
    if (this.entries.size >= 16) throw new Error("Too many plugin backgrounds")
    const entry: Entry = {
      owner: binding.owner,
      space: binding.space,
      plugin: binding.manifest.id,
      hash: binding.hash,
      abort,
      ready: Promise.resolve().then(() => this.launch(binding, abort, device)),
    }
    this.entries.set(key, entry)
    entry.ready = entry.ready.finally(() => {
      if (abort.signal.aborted && this.entries.get(key) === entry)
        this.entries.delete(key)
    })
    void entry.ready.then(
      (background) =>
        background.exited.then(() => {
          if (this.entries.get(key) === entry) this.entries.delete(key)
        }),
      () => {
        if (this.entries.get(key) === entry) this.entries.delete(key)
      }
    )
    return entry.ready
  }
  private async launch(
    binding: BackgroundBinding,
    abort: AbortController,
    device?: BluetoothDeviceInfo
  ) {
    const origins = binding.manifest.background?.networkOrigins ?? []
    const allowLoopback =
      origins.length === 1 &&
      origins[0] === this.options.loopbackOrigin &&
      /^ws:\/\/127\.0\.0\.1(?::[0-9]+)?$/.test(origins[0]!)
    if (origins.some((origin) => origin.startsWith("ws:")) && !allowLoopback)
      throw new PluginError(
        "PERMISSION_DENIED",
        "Local WS requires an exact development host grant and cannot be mixed with other origins"
      )
    if (!device && !(await this.approve(binding)))
      throw new PluginError(
        "PERMISSION_DENIED",
        "Background permission declined"
      )
    await binding.authorize()
    abort.signal.throwIfAborted()
    const directory = await mkdtemp(
      path.join(tmpdir(), "eidos-lite-background-")
    )
    let timer: ReturnType<typeof setInterval> | undefined
    const cleanup = async () => {
      clearInterval(timer)
      await rm(directory, { recursive: true, force: true })
    }
    try {
      const entry = path.join(directory, "background.mjs")
      await writeFile(entry, binding.code, { mode: 0o600, flag: "wx" })
      abort.signal.throwIfAborted()
      const background = await startBackground({
        binaryPath: this.binaryPath,
        entry,
        signal: abort.signal,
        permissions: {
          ...(device
            ? {
                bluetooth: {
                  devices: [
                    {
                      id: device.id,
                      ...(device.name ? { name: device.name } : {}),
                      services:
                        binding.manifest.background!.bluetooth!.services,
                    },
                  ],
                },
              }
            : {}),
          network: {
            origins,
            ...(allowLoopback ? { allowPrivateAddresses: true } : {}),
          },
        },
        bluetoothMock: this.options.bluetoothMock,
        onError: (error) =>
          console.error(
            "Plugin background:",
            binding.manifest.id,
            error.message
          ),
      })
      // Covers Space switches even when no plugin RPC follows the switch.
      let checking = false
      timer = setInterval(() => {
        if (checking) return
        checking = true
        void binding
          .authorize()
          .catch(() => abort.abort())
          .finally(() => {
            checking = false
          })
      }, 500)
      timer.unref()
      this.pending.set(background, new Set())
      void background.exited.then(() => {
        for (const fail of this.pending.get(background) ?? [])
          fail(new Error("Background exited"))
        this.pending.delete(background)
      })
      void background.exited.then(cleanup).catch(console.error)
      return background
    } catch (error) {
      await cleanup()
      throw error
    }
  }
  async request(
    binding: BackgroundBinding,
    method: string,
    data: JsonValue,
    signal: AbortSignal
  ): Promise<JsonValue> {
    if (method === "background.requestDevice") {
      if (!binding.manifest.background?.bluetooth || !this.options.chooseDevice)
        throw new PluginError("PERMISSION_DENIED", "Bluetooth was not declared")
      await binding.authorize()
      signal.throwIfAborted()
      if (this.closed) throw new Error("Background host is closed")
      const key = this.key(binding)
      if (this.selections.has(key))
        throw new Error("Bluetooth selection is already in progress")
      if (this.selections.size >= 4)
        throw new Error("Too many pending Bluetooth selections")
      const abort = new AbortController()
      const cancel = () => abort.abort()
      signal.addEventListener("abort", cancel, { once: true })
      let checking = false
      const timer = setInterval(() => {
        if (checking) return
        checking = true
        void binding
          .authorize()
          .catch(cancel)
          .finally(() => {
            checking = false
          })
      }, 500)
      const deadline = setTimeout(cancel, 295000)
      timer.unref()
      const promise = (async () => {
        const device = await this.options.chooseDevice!(binding, abort.signal)
        abort.signal.throwIfAborted()
        await binding.authorize()
        if (!device)
          throw new PluginError(
            "PERMISSION_DENIED",
            "Bluetooth selection cancelled"
          )
        const old = this.entries.get(key)
        old?.abort.abort()
        await (await old?.ready.catch(() => undefined))?.stop()
        if (this.entries.get(key) === old) this.entries.delete(key)
        abort.signal.throwIfAborted()
        await binding.authorize()
        const stopStarting = () => this.entries.get(key)?.abort.abort()
        abort.signal.addEventListener("abort", stopStarting, { once: true })
        try {
          const background = await this.create(binding, device)
          if (abort.signal.aborted) {
            await background.stop()
            abort.signal.throwIfAborted()
          }
        } finally {
          abort.signal.removeEventListener("abort", stopStarting)
        }
        return { id: device.id, ...(device.name ? { name: device.name } : {}) }
      })().finally(() => {
        clearInterval(timer)
        clearTimeout(deadline)
        signal.removeEventListener("abort", cancel)
        this.selections.delete(key)
      })
      this.selections.set(key, { binding, abort, promise })
      return promise
    }
    if (method === "background.stop") {
      this.selections.get(this.key(binding))?.abort.abort()
      const entry = this.entries.get(this.key(binding))
      entry?.abort.abort()
      const background = await entry?.ready.catch(() => undefined)
      await background?.stop()
      return null
    }
    if (
      ![
        "background.start",
        "background.postMessage",
        "background.request",
      ].includes(method)
    )
      throw new PluginError("INVALID_REQUEST", "Unknown background method")
    const background = await this.start(binding)
    await binding.authorize()
    signal.throwIfAborted()
    if (method === "background.start") return null
    if (method === "background.postMessage") {
      await background.postMessage(data)
      return null
    }
    const requestId = randomUUID()
    const pending = this.pending.get(background)
    if (!pending || pending.size >= 64)
      throw new Error("Background unavailable or too many pending requests")
    return new Promise<JsonValue>((resolve, reject) => {
      let unsubscribe = () => {}
      const finish = (error?: Error, value: JsonValue = null) => {
        clearTimeout(timer)
        unsubscribe()
        pending.delete(finish)
        signal.removeEventListener("abort", aborted)
        if (error) reject(error)
        else resolve(value)
      }
      const aborted = () => finish(new Error("Background request cancelled"))
      const timer = setTimeout(
        () => finish(new Error("Background reply timed out")),
        30000
      )
      pending.add(finish)
      unsubscribe = background.onMessage((message) => {
        if (
          message &&
          typeof message === "object" &&
          !Array.isArray(message) &&
          message.requestId === requestId &&
          Object.hasOwn(message, "data")
        )
          finish(undefined, message.data)
      })
      signal.addEventListener("abort", aborted, { once: true })
      if (signal.aborted) {
        aborted()
        return
      }
      void background
        .postMessage({ requestId, data })
        .catch((error: Error) => finish(error))
    })
  }
  revoke(plugin: string, space?: string) {
    for (const selection of this.selections.values())
      if (
        selection.binding.manifest.id === plugin &&
        (!space || selection.binding.space === space)
      )
        selection.abort.abort()
    for (const entry of this.entries.values())
      if (entry.plugin === plugin && (!space || entry.space === space))
        entry.abort.abort()
  }
  closeOwner(owner: number) {
    for (const selection of this.selections.values())
      if (selection.binding.owner === owner) selection.abort.abort()
    for (const entry of this.entries.values())
      if (entry.owner === owner) entry.abort.abort()
  }
  close() {
    this.closed = true
    for (const selection of this.selections.values()) selection.abort.abort()
    for (const entry of this.entries.values()) entry.abort.abort()
  }
}
