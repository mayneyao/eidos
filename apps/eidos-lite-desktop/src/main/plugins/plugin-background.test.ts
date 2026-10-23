import { afterEach, expect, it, vi } from "vitest"
import type {
  BackgroundOptions,
  JsonValue,
  BluetoothDeviceInfo,
} from "@eidos.space/plugin-sandbox"
import {
  PluginBackgroundHost,
  type BackgroundBinding,
} from "./plugin-background"

const fake = vi.hoisted(() => ({
  starts: [] as BackgroundOptions[],
  messages: new Set<(value: JsonValue) => void>(),
  stops: 0,
}))
vi.mock("@eidos.space/plugin-sandbox", () => ({
  async startBackground(options: BackgroundOptions) {
    fake.starts.push(options)
    let exit!: (value: unknown) => void
    const exited = new Promise((resolve) => {
      exit = resolve
    })
    const stop = async () => {
      fake.stops++
      exit({ reason: "stopped" })
    }
    options.signal?.addEventListener(
      "abort",
      () => {
        void stop()
      },
      { once: true }
    )
    if (options.signal?.aborted) await stop()
    return {
      exited,
      stop,
      onMessage(callback: (value: JsonValue) => void) {
        fake.messages.add(callback)
        return () => fake.messages.delete(callback)
      },
      async postMessage(message: JsonValue) {
        queueMicrotask(() => {
          for (const listener of fake.messages) listener(message)
        })
      },
    }
  },
}))
const hosts: PluginBackgroundHost[] = []
afterEach(() => {
  for (const host of hosts.splice(0)) host.close()
  fake.starts.length = 0
  fake.messages.clear()
  fake.stops = 0
})
function setup(
  approve = vi.fn(async () => true),
  options: ConstructorParameters<typeof PluginBackgroundHost>[2] = {}
) {
  const host = new PluginBackgroundHost(
    "/test/plugin-sandbox",
    approve,
    options
  )
  hosts.push(host)
  const binding: BackgroundBinding = {
    owner: 1,
    space: "space-a",
    hash: "revision-a",
    manifest: {
      apiVersion: 1,
      id: "test.background",
      name: "Test",
      version: "1.0.0",
      background: {
        entry: "./background.js",
        networkOrigins: ["wss://example.com"],
      },
    },
    code: "onmessage = e => postMessage(e.data)",
    authorize: vi.fn(async () => {}),
  }
  return { host, binding, approve }
}

it("requires an exact trusted host grant for local WS and rejects mixed origins", async () => {
  const local = "ws://127.0.0.1:8787"
  const denied = setup()
  denied.binding.manifest.background!.networkOrigins = [local]
  await expect(denied.host.start(denied.binding)).rejects.toThrow(
    "development host grant"
  )
  expect(fake.starts).toHaveLength(0)
  const allowed = setup(undefined, { loopbackOrigin: local })
  allowed.binding.manifest.background!.networkOrigins = [local]
  await allowed.host.start(allowed.binding)
  expect(fake.starts[0]?.permissions?.network).toEqual({
    origins: [local],
    allowPrivateAddresses: true,
  })
  const mixed = setup(undefined, { loopbackOrigin: local })
  mixed.binding.manifest.background!.networkOrigins = [
    local,
    "wss://example.com",
  ]
  await expect(mixed.host.start(mixed.binding)).rejects.toThrow(
    "cannot be mixed"
  )
  const differentPort = setup(undefined, { loopbackOrigin: local })
  differentPort.binding.manifest.background!.networkOrigins = [
    "ws://127.0.0.1:8788",
  ]
  await expect(differentPort.host.start(differentPort.binding)).rejects.toThrow(
    "development host grant"
  )
})

it("keeps a running background on cancel and replaces it with only the selected device grant", async () => {
  const chooseDevice = vi.fn(
    async (): Promise<BluetoothDeviceInfo | null> => null
  )
  const { host, binding } = setup(undefined, { chooseDevice })
  binding.manifest.background!.bluetooth = {
    services: [{ uuid: "battery_service", read: true }],
  }
  await host.start(binding)
  const signal = new AbortController().signal
  await expect(
    host.request(binding, "background.requestDevice", null, signal)
  ).rejects.toThrow("cancelled")
  expect(fake.stops).toBe(0)
  chooseDevice.mockResolvedValue({
    id: "selected-id",
    name: "Chosen",
    services: [],
  })
  expect(
    await host.request(binding, "background.requestDevice", null, signal)
  ).toEqual({ id: "selected-id", name: "Chosen" })
  expect(fake.starts).toHaveLength(2)
  expect(fake.starts[1].permissions?.bluetooth).toEqual({
    devices: [
      {
        id: "selected-id",
        name: "Chosen",
        services: [{ uuid: "battery_service", read: true }],
      },
    ],
  })
})

it("rejects undeclared Bluetooth and stale picker approval", async () => {
  let choose!: (device: BluetoothDeviceInfo) => void
  const chooseDevice = vi.fn(
    () =>
      new Promise<BluetoothDeviceInfo>((resolve) => {
        choose = resolve
      })
  )
  const { host, binding } = setup(undefined, { chooseDevice })
  await expect(
    host.request(
      binding,
      "background.requestDevice",
      null,
      new AbortController().signal
    )
  ).rejects.toThrow("not declared")
  expect(chooseDevice).not.toHaveBeenCalled()
  binding.manifest.background!.bluetooth = {
    services: [{ uuid: "battery_service", read: true }],
  }
  const selected = host.request(
    binding,
    "background.requestDevice",
    null,
    new AbortController().signal
  )
  await vi.waitFor(() => expect(chooseDevice).toHaveBeenCalled())
  host.revoke(binding.manifest.id)
  choose({ id: "stale-id", services: [] })
  await expect(selected).rejects.toThrow()
  expect(fake.starts).toHaveLength(0)
})
it("coalesces starts, restricts permissions and correlates concurrent replies", async () => {
  const { host, binding, approve } = setup()
  const signal = new AbortController().signal
  expect(
    await Promise.all([
      host.request(binding, "background.request", "one", signal),
      host.request(binding, "background.request", "two", signal),
    ])
  ).toEqual(["one", "two"])
  expect(approve).toHaveBeenCalledTimes(1)
  expect(fake.starts).toHaveLength(1)
  expect(fake.starts[0].permissions).toEqual({
    network: { origins: ["wss://example.com"] },
  })
  expect(fake.messages.size).toBe(0)
  host.revoke(binding.manifest.id, "another-space")
  expect(fake.stops).toBe(0)
  host.revoke(binding.manifest.id, binding.space)
  expect(fake.stops).toBe(1)
})
it("does not spawn after denied approval or revocation during approval", async () => {
  const denied = setup(vi.fn(async () => false))
  await expect(denied.host.start(denied.binding)).rejects.toThrow("declined")
  let allow!: (value: boolean) => void
  const waiting = setup(
    vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          allow = resolve
        })
    )
  )
  const started = waiting.host.start(waiting.binding)
  await vi.waitFor(() => expect(allow).toBeDefined())
  waiting.host.closeOwner(1)
  allow(true)
  await expect(started).rejects.toThrow()
  expect(fake.starts).toHaveLength(0)
})
it("stops after host authorization is revoked and rejects stale revisions", async () => {
  const { host, binding } = setup()
  await host.start(binding)
  await expect(host.start({ ...binding, hash: "revision-b" })).rejects.toThrow(
    "revision"
  )
  binding.authorize = async () => {
    throw new Error("Space closed")
  }
  await vi.waitFor(() => expect(fake.stops).toBe(1), { timeout: 1500 })
})
