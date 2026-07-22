// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const harness = vi.hoisted(() => ({
  instances: [] as Array<{
    workerData: unknown
    open: ReturnType<typeof vi.fn>
    export: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    terminate: ReturnType<typeof vi.fn>
  }>,
  runtime: {
    mutateRows: vi.fn(),
    cancel: vi.fn(),
  },
  candidate: new Uint8Array([83, 81, 76, 105, 116, 101]),
}))

vi.mock("./eidos-file-runtime-worker-client", () => ({
  EidosFileRuntimeWorkerClient: class {
    open = vi.fn(async () => ({
      runtime: harness.runtime,
      snapshot: {
        fileId: "019f8a00-0000-7000-8000-000000000001",
        revision: "0",
        defaultTableId: null,
        updatedAt: "2026-07-23T00:00:00.000Z",
      },
    }))
    export = vi.fn(async () => harness.candidate.slice())
    close = vi.fn(async () => undefined)
    terminate = vi.fn(async () => undefined)

    constructor(readonly workerData: unknown) {
      harness.instances.push(this)
    }
  },
}))

import { DesktopEidosFileHostService } from "./eidos-file-host.service"
import type { SpaceRegistry } from "./space-registry"
import type { SpaceResourceLifecycle } from "./space-resource-lifecycle"

const context = (action: string) => ({
  requestId: `test-${action}`,
  deadlineMilliseconds: 30_000,
})

describe("DesktopEidosFileHostService", () => {
  let root: string
  let service: DesktopEidosFileHostService

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "eidos-desktop-host-test-"))
    await writeFile(path.join(root, "tasks.eidos"), new Uint8Array([1, 2, 3]))
    harness.instances.length = 0
    harness.runtime.mutateRows.mockReset()
    harness.runtime.cancel.mockReset()
    const registry = {
      getSpace: vi.fn(() => ({ id: "space", mode: "file", path: root })),
    } as unknown as SpaceRegistry
    const lifecycle = { register: vi.fn() } as unknown as SpaceResourceLifecycle
    service = new DesktopEidosFileHostService(registry, lifecycle)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("negotiates EA-Host-1.0 and publishes Worker mutations atomically", async () => {
    expect(
      service.negotiate(
        { protocol: "eidos-host", versions: ["1.0"] },
        context("negotiate")
      )
    ).toMatchObject({
      version: "1.0",
      serviceCapabilities: { canOpenSource: true },
      limits: { candidateBytesMax: "268435456" },
    })

    const { sourceToken } = await service.registerSource("space", "tasks.eidos")
    const opened = await service.openSource(
      { sourceToken, access: "readwrite" },
      context("open")
    )
    await expect(
      service.invokeRuntime(
        opened.sessionId,
        "constructor" as never,
        {},
        context("invalid-operation")
      )
    ).rejects.toMatchObject({ code: "invalid-request" })
    harness.runtime.mutateRows.mockResolvedValue({
      changed: true,
      revision: "1",
    })
    await service.invokeRuntime(
      opened.sessionId,
      "mutateRows",
      { tableId: "table", expectedRevision: "0", changes: [] },
      context("mutate")
    )
    expect(service.getSessionState(opened.sessionId)).toMatchObject({
      phase: "ready-dirty",
      revision: "1",
    })

    await expect(
      service.save({ sessionId: opened.sessionId }, context("save"))
    ).resolves.toMatchObject({ state: { phase: "ready-clean" } })
    await expect(readFile(path.join(root, "tasks.eidos"))).resolves.toEqual(
      Buffer.from(harness.candidate)
    )
    await service.close({ sessionId: opened.sessionId }, context("close"))
    expect(harness.instances[0]?.close).toHaveBeenCalledOnce()
  })

  it("reports a conflict instead of replacing an externally changed source", async () => {
    const { sourceToken } = await service.registerSource("space", "tasks.eidos")
    const opened = await service.openSource(
      { sourceToken, access: "readwrite" },
      context("open-conflict")
    )
    harness.runtime.mutateRows.mockResolvedValue({
      changed: true,
      revision: "1",
    })
    await service.invokeRuntime(
      opened.sessionId,
      "mutateRows",
      { tableId: "table", expectedRevision: "0", changes: [] },
      context("mutate-conflict")
    )
    await writeFile(path.join(root, "tasks.eidos"), new Uint8Array([9, 9, 9]))

    await expect(
      service.save({ sessionId: opened.sessionId }, context("save-conflict"))
    ).rejects.toMatchObject({ code: "conflict" })
    expect(service.getSessionState(opened.sessionId)).toMatchObject({
      phase: "conflict",
      error: { code: "conflict" },
    })
    await expect(readFile(path.join(root, "tasks.eidos"))).resolves.toEqual(
      Buffer.from([9, 9, 9])
    )
    await service.close(
      { sessionId: opened.sessionId },
      context("close-conflict")
    )
  })

  it("enforces one writable session per source and releases it on close", async () => {
    const first = await service.registerSource("space", "tasks.eidos")
    const second = await service.registerSource("space", "tasks.eidos")
    const writer = await service.openSource(
      { sourceToken: first.sourceToken, access: "readwrite" },
      context("open-first-writer")
    )

    await expect(
      service.openSource(
        { sourceToken: second.sourceToken, access: "readwrite" },
        context("open-second-writer")
      )
    ).rejects.toMatchObject({ code: "writer-unavailable", retryable: true })

    const reader = await service.openSource(
      { sourceToken: second.sourceToken, access: "read" },
      context("open-reader")
    )
    expect(reader.state.phase).toBe("ready-readonly")
    await service.close(
      { sessionId: reader.sessionId },
      context("close-reader")
    )
    await service.close(
      { sessionId: writer.sessionId },
      context("close-writer")
    )

    const third = await service.registerSource("space", "tasks.eidos")
    const replacement = await service.openSource(
      { sourceToken: third.sourceToken, access: "readwrite" },
      context("open-replacement-writer")
    )
    await service.close(
      { sessionId: replacement.sessionId },
      context("close-replacement-writer")
    )
  })

  it("creates a new file through Runtime.create and publishes it create-only", async () => {
    const { destinationToken } = await service.registerDestination(
      "space",
      "created.eidos"
    )
    const opened = await service.createSource(
      { destinationToken, title: "Created" },
      context("create")
    )

    expect(harness.instances[0]?.workerData).toMatchObject({
      access: "readwrite",
      create: { title: "Created" },
    })
    await expect(readFile(path.join(root, "created.eidos"))).resolves.toEqual(
      Buffer.from(harness.candidate)
    )
    await service.close(
      { sessionId: opened.sessionId },
      context("close-created")
    )

    const duplicate = await service.registerDestination(
      "space",
      "created.eidos"
    )
    await expect(
      service.createSource(
        { destinationToken: duplicate.destinationToken, title: "Duplicate" },
        context("create-duplicate")
      )
    ).rejects.toMatchObject({ code: "file-exists" })
    await expect(readFile(path.join(root, "created.eidos"))).resolves.toEqual(
      Buffer.from(harness.candidate)
    )
  })
})
