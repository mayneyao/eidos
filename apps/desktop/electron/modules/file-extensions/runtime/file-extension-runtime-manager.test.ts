// @vitest-environment node

import "reflect-metadata"

import { describe, expect, it, vi } from "vitest"

import type {
  CreateFileExtensionRuntimeTransportOptions,
  FileExtensionRuntimeTransport,
  FileExtensionRuntimeTransportFactory,
} from "./electron-runtime-transport"

vi.mock("electron", () => ({
  BrowserWindow: class {},
  MessageChannelMain: class {},
  session: {},
}))

class FakeTransport implements FileExtensionRuntimeTransport {
  readonly outbound: unknown[] = []
  disposed = false
  private messageListener?: (message: unknown) => void
  private closeListener?: () => void

  postMessage(message: unknown): void {
    if (this.disposed) throw new Error("transport closed")
    this.outbound.push(message)
  }

  onMessage(listener: (message: unknown) => void): void {
    this.messageListener = listener
  }

  onClose(listener: () => void): void {
    this.closeListener = listener
  }

  dispose(): void {
    this.disposed = true
  }

  emit(message: unknown): void {
    this.messageListener?.(message)
  }

  close(): void {
    this.closeListener?.()
  }
}

class FakeTransportFactory implements FileExtensionRuntimeTransportFactory {
  readonly calls: CreateFileExtensionRuntimeTransportOptions[] = []
  readonly transports: FakeTransport[] = []

  async create(
    options: CreateFileExtensionRuntimeTransportOptions
  ): Promise<FileExtensionRuntimeTransport> {
    this.calls.push(options)
    const transport = new FakeTransport()
    this.transports.push(transport)
    return transport
  }
}

const snapshot = {
  packageId: "example.task-counter",
  contentDigest: `sha256:${"1".repeat(64)}`,
  permissionHash: `sha256:${"2".repeat(64)}`,
}

async function setup() {
  const { FileExtensionRuntimeManager } =
    await import("./file-extension-runtime-manager")
  const factory = new FakeTransportFactory()
  const manager = new FileExtensionRuntimeManager(factory)
  const handleRpc = vi.fn(async () => "rpc-value")
  const descriptor = {
    spaceId: "space-a",
    snapshot,
    bundleCode: "globalThis.__eidosExtensionModule = {}",
    commandIds: ["example.task-counter.count"],
    panelIds: [],
  }
  return { manager, factory, handleRpc, descriptor }
}

async function activate(
  factory: FakeTransportFactory,
  execution: Promise<void>
): Promise<FakeTransport> {
  await vi.waitFor(() => expect(factory.transports).toHaveLength(1))
  const transport = factory.transports[0]!
  transport.emit({
    type: "ready",
    generation: factory.calls[0]!.generation,
    commands: ["example.task-counter.count"],
  })
  await vi.waitFor(() =>
    expect(transport.outbound).toContainEqual(
      expect.objectContaining({ type: "invoke" })
    )
  )
  return transport
}

describe("FileExtensionRuntimeManager", () => {
  it("creates lazily, routes RPC, and reuses one exact snapshot runtime", async () => {
    const { manager, factory, handleRpc, descriptor } = await setup()
    const first = manager.execute({
      descriptor,
      commandId: descriptor.commandIds[0]!,
      resource: { path: "tasks.md" },
      handleRpc,
    })
    const transport = await activate(factory, first)
    const invoke = transport.outbound.find(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "invoke"
    ) as { requestId: string }

    transport.emit({
      type: "rpc",
      requestId: "rpc-1",
      method: "space.files.readText",
      params: { path: "tasks.md" },
    })
    await vi.waitFor(() => expect(handleRpc).toHaveBeenCalledOnce())
    expect(transport.outbound).toContainEqual({
      type: "rpc-result",
      requestId: "rpc-1",
      ok: true,
      value: "rpc-value",
    })
    transport.emit({
      type: "invoke-result",
      requestId: invoke.requestId,
      ok: true,
    })
    await expect(first).resolves.toBeUndefined()

    const second = manager.execute({
      descriptor,
      commandId: descriptor.commandIds[0]!,
      resource: { path: "other.md" },
      handleRpc,
    })
    await vi.waitFor(() =>
      expect(
        transport.outbound.filter(
          (message) =>
            typeof message === "object" &&
            message !== null &&
            "type" in message &&
            message.type === "invoke"
        )
      ).toHaveLength(2)
    )
    const secondInvoke = transport.outbound.at(-1) as { requestId: string }
    transport.emit({
      type: "invoke-result",
      requestId: secondInvoke.requestId,
      ok: true,
    })
    await expect(second).resolves.toBeUndefined()
    expect(factory.calls).toHaveLength(1)
    expect(manager.has("space-a", snapshot)).toBe(true)
  })

  it("fails closed on stale generations", async () => {
    const { manager, factory, handleRpc, descriptor } = await setup()
    const execution = manager.execute({
      descriptor,
      commandId: descriptor.commandIds[0]!,
      resource: { path: "tasks.md" },
      handleRpc,
    })
    await vi.waitFor(() => expect(factory.transports).toHaveLength(1))
    factory.transports[0]!.emit({
      type: "ready",
      generation: "stale-generation",
      commands: ["example.task-counter.other"],
    })
    await expect(execution).rejects.toMatchObject({ code: "RUNTIME_STALE" })
    expect(factory.transports[0]!.disposed).toBe(true)
    expect(manager.has("space-a", snapshot)).toBe(false)
  })

  it("rejects commands registered outside the manifest", async () => {
    const { manager, factory, handleRpc, descriptor } = await setup()
    const execution = manager.execute({
      descriptor,
      commandId: descriptor.commandIds[0]!,
      resource: { path: "tasks.md" },
      handleRpc,
    })
    await vi.waitFor(() => expect(factory.transports).toHaveLength(1))
    factory.transports[0]!.emit({
      type: "ready",
      generation: factory.calls[0]!.generation,
      commands: ["example.task-counter.undeclared"],
    })
    await expect(execution).rejects.toMatchObject({
      code: "RUNTIME_PROTOCOL_ERROR",
    })
    expect(factory.transports[0]!.disposed).toBe(true)
  })

  it("routes bounded console output for the active generation", async () => {
    const { manager, factory, handleRpc, descriptor } = await setup()
    const handleLog = vi.fn()
    const execution = manager.execute({
      descriptor,
      commandId: descriptor.commandIds[0]!,
      resource: { path: "tasks.md" },
      handleRpc,
      handleLog,
    })
    const transport = await activate(factory, execution)
    transport.emit({
      type: "log",
      generation: factory.calls[0]!.generation,
      level: "info",
      message: "Found 3 tasks",
    })
    expect(handleLog).toHaveBeenCalledWith({
      type: "log",
      generation: factory.calls[0]!.generation,
      level: "info",
      message: "Found 3 tasks",
    })

    const invoke = transport.outbound.find(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "invoke"
    ) as { requestId: string }
    transport.emit({
      type: "invoke-result",
      requestId: invoke.requestId,
      ok: true,
    })
    await expect(execution).resolves.toBeUndefined()
  })

  it("rejects pending work when a package is invalidated", async () => {
    const { manager, factory, handleRpc, descriptor } = await setup()
    const execution = manager.execute({
      descriptor,
      commandId: descriptor.commandIds[0]!,
      resource: { path: "tasks.md" },
      handleRpc,
    })
    const transport = await activate(factory, execution)
    manager.disposePackage("space-a", snapshot.packageId, "source changed")
    await expect(execution).rejects.toMatchObject({ code: "RUNTIME_STALE" })
    expect(transport.disposed).toBe(true)
  })

  it("rejects pending work when the isolated renderer crashes", async () => {
    const { manager, factory, handleRpc, descriptor } = await setup()
    const execution = manager.execute({
      descriptor,
      commandId: descriptor.commandIds[0]!,
      resource: { path: "tasks.md" },
      handleRpc,
    })
    const transport = await activate(factory, execution)
    transport.close()
    await expect(execution).rejects.toMatchObject({
      code: "RUNTIME_DISPOSED",
    })
    expect(manager.has("space-a", snapshot)).toBe(false)
  })

  it("times out an extension that never activates", async () => {
    vi.useFakeTimers()
    try {
      const { manager, factory, handleRpc, descriptor } = await setup()
      const execution = manager.execute({
        descriptor,
        commandId: descriptor.commandIds[0]!,
        resource: { path: "tasks.md" },
        handleRpc,
      })
      const rejection = expect(execution).rejects.toMatchObject({
        code: "RUNTIME_TIMEOUT",
      })
      await vi.advanceTimersByTimeAsync(5_001)
      await rejection
      expect(factory.transports[0]!.disposed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
