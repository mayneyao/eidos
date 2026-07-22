import { beforeEach, describe, expect, it, vi } from "vitest"

import { DesktopEidosFileHostServices } from "./desktop-host-services"

const hostState = {
  sessionId: "session-1",
  phase: "ready-clean" as const,
  capabilities: {
    canWriteCurrent: true,
    canSaveCopy: false,
    canRequestPermission: false,
    hasRecovery: false,
    assetReadSchemes: [],
    assetWriteSchemes: [],
    casGuarantee: "strong" as const,
    atomicReplace: true,
    durability: "durable" as const,
  },
  limits: {
    sourceBytesMax: "1024",
    candidateBytesMax: "1024",
    recoveryBytesMax: "0",
    recoveryEntriesMax: 0,
    recoveryRetentionSecondsMax: 0,
    assetBytesMax: "0",
    assetPreviewBytesMax: "0",
    concurrentAssetLeasesMax: 0,
    concurrentSessionsMax: 1,
  },
}

describe("DesktopEidosFileHostServices", () => {
  const invokeRuntime = vi.fn()
  const getSessionState = vi.fn()
  const save = vi.fn()
  const close = vi.fn()

  beforeEach(() => {
    invokeRuntime.mockReset()
    getSessionState.mockReset().mockResolvedValue(hostState)
    save.mockReset()
    close.mockReset()
    Object.assign(window, {
      eidos: {
        eidosFileHost: {
          registerSource: vi.fn(async () => ({ sourceToken: "source-1" })),
          revokeSource: vi.fn(async () => undefined),
          negotiate: vi.fn(async () => ({
            version: "1.0",
            serviceCapabilities: { canOpenSource: true },
            limits: hostState.limits,
          })),
          openSource: vi.fn(async () => ({
            sessionId: "session-1",
            state: hostState,
          })),
          invokeRuntime,
          getSessionState,
          cancelRuntime: vi.fn(async () => undefined),
          save,
          reconcileCommit: vi.fn(),
          resolveConflict: vi.fn(),
          listRecovery: vi.fn(async () => ({ items: [] })),
          close,
        },
      },
    })
  })

  it("returns only a RuntimeClient and opaque Host session to renderer UI", async () => {
    const host = new DesktopEidosFileHostServices()
    const grant = await host.registerSource("space", "tasks.eidos")
    expect(grant).toEqual({ sourceToken: "source-1" })
    const opened = await host.openSource(
      { sourceToken: grant.sourceToken, access: "readwrite" },
      { requestId: "open" }
    )
    invokeRuntime.mockResolvedValue({
      version: "1.0",
      capabilities: { mutateRows: true },
      limits: {},
    })

    await opened.runtime.negotiate(
      { protocol: "eidos-runtime", versions: ["1.0"] },
      { requestId: "runtime-negotiate" }
    )
    expect(invokeRuntime).toHaveBeenCalledWith(
      "session-1",
      "negotiate",
      { protocol: "eidos-runtime", versions: ["1.0"] },
      { requestId: "runtime-negotiate" }
    )

    const dirtyState = {
      ...hostState,
      phase: "ready-dirty" as const,
      revision: "1",
    }
    const onState = vi.fn()
    host.subscribe(opened.sessionId, onState)
    invokeRuntime.mockResolvedValue({
      changed: true,
      revision: "1",
      created: [],
      affectedRows: [],
    })
    getSessionState.mockResolvedValueOnce(dirtyState)
    await opened.runtime.mutateRows(
      {
        tableId: "019f8a00-0000-7000-8000-000000000001",
        expectedRevision: "0",
        changes: [],
      },
      { requestId: "runtime-mutate" }
    )
    expect(onState).toHaveBeenCalledWith(dirtyState)

    save.mockResolvedValue({ state: hostState })
    await host.save({ sessionId: opened.sessionId }, { requestId: "save" })
    expect(save).toHaveBeenCalledWith(
      { sessionId: "session-1" },
      { requestId: "save" }
    )

    close.mockResolvedValue(undefined)
    await host.close({ sessionId: opened.sessionId }, { requestId: "close" })
    expect(close).toHaveBeenCalledOnce()
  })
})
