import { describe, expect, it, vi } from "vitest"
import type { EidosSyncAction } from "../../shared/contracts"
import { SpaceSession } from "./space-session"

function sessionFixture(ahead: number, behind: number, dirty: boolean) {
  const relation = { ahead, behind, dirty, hasConflicts: false }
  const run = async (
    _label: string,
    operation: (signal: AbortSignal) => unknown
  ) => operation(new AbortController().signal)
  const graft = {
    configureOfficialRemote: vi.fn().mockResolvedValue(undefined),
    getMergeStatusIfAvailable: vi.fn().mockResolvedValue({ state: "none" }),
    status: vi.fn(async () => ({ ...relation })),
    fetch: vi.fn().mockResolvedValue(undefined),
    push: vi.fn(async () => {
      relation.ahead = 0
    }),
    stageAll: vi.fn(),
    commit: vi.fn(),
    applyMerge: vi.fn(),
  }
  const session = {
    syncTask: Promise.resolve(),
    withSyncTask: SpaceSession.prototype["withSyncTask"],
    syncHostedRemoteInternal:
      SpaceSession.prototype["syncHostedRemoteInternal"],
    configureHostedSyncRemote:
      SpaceSession.prototype["configureHostedSyncRemote"],
    canonical: { root: "/unused" },
    officialSyncRemoteUrl: async () => "https://sync.eidos.space/test/repo",
    gate: { withRepositoryOperation: run },
    repository: {
      runForeground: (operation: (signal: AbortSignal) => unknown) =>
        run("", operation),
    },
    graft,
    graftStatusOptions: () => ({}),
    assertGraftPathsSafeForMerge: () => undefined,
    recordSyncHistoryCheck: vi.fn(),
    completeResolvedMerge: vi.fn(async (value: unknown) => value),
    syncResult: async (
      state: string,
      _message: string,
      pulled: boolean,
      pushed: boolean
    ) => ({ state, pulled, pushed }),
  } as unknown as SpaceSession
  const invoke = (
    action: EidosSyncAction,
    access: "read_only" | "read_write" = "read_write"
  ) =>
    SpaceSession.prototype.syncHostedRemote.call(
      session,
      "token",
      access,
      () => undefined,
      () => undefined,
      action
    )
  return { graft, session, invoke }
}

describe("explicit Sync actions", () => {
  it("does not upload from a read-only Space during a full sync", async () => {
    const { graft, invoke } = sessionFixture(1, 0, false)
    expect(await invoke("sync", "read_only")).toMatchObject({
      state: "read-only",
      pushed: false,
      pulled: false,
    })
    expect(graft.fetch).toHaveBeenCalledOnce()
    expect(graft.push).not.toHaveBeenCalled()
  })

  it("stops when history diverges between the initial check and fetch", async () => {
    const { graft, invoke } = sessionFixture(0, 0, false)
    graft.status.mockResolvedValueOnce({
      ahead: 0,
      behind: 0,
      dirty: false,
      hasConflicts: false,
    })
    graft.status.mockResolvedValueOnce({
      ahead: 1,
      behind: 1,
      dirty: false,
      hasConflicts: false,
    })
    expect(await invoke("sync")).toMatchObject({
      state: "conflict",
      pushed: false,
      pulled: false,
    })
    expect(graft.fetch).toHaveBeenCalledOnce()
    expect(graft.push).not.toHaveBeenCalled()
    expect(graft.applyMerge).not.toHaveBeenCalled()
  })
  it("checks remote history before uploading saved versions in a full sync", async () => {
    const { graft, invoke } = sessionFixture(2, 0, false)
    expect(await invoke("sync")).toMatchObject({
      state: "synced",
      pushed: true,
      pulled: false,
    })
    expect(graft.fetch).toHaveBeenCalledOnce()
    expect(graft.push).toHaveBeenCalledOnce()
    expect(graft.fetch.mock.invocationCallOrder[0]).toBeLessThan(
      graft.push.mock.invocationCallOrder[0]!
    )
    expect(graft.commit).not.toHaveBeenCalled()
  })

  it("leaves divergent histories and unsaved changes untouched during full sync", async () => {
    const divergent = sessionFixture(2, 3, false)
    expect(await divergent.invoke("sync")).toMatchObject({
      state: "conflict",
      pushed: false,
      pulled: false,
    })
    expect(divergent.graft.push).not.toHaveBeenCalled()
    expect(divergent.graft.applyMerge).not.toHaveBeenCalled()
    const dirty = sessionFixture(0, 2, true)
    await expect(dirty.invoke("sync")).rejects.toThrow("checkpoint")
    expect(dirty.graft.fetch).not.toHaveBeenCalled()
    expect(dirty.graft.applyMerge).not.toHaveBeenCalled()
    expect(dirty.graft.push).not.toHaveBeenCalled()
  })
  it("queues device work behind Cloud sync and continues after a failure", async () => {
    const { graft, session, invoke } = sessionFixture(0, 0, false)
    let release: () => void = () => {}
    graft.fetch.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )
    const cloud = invoke("fetch")
    await vi.waitFor(() => expect(graft.fetch).toHaveBeenCalledOnce())
    const peer = vi.fn(async () => {})
    const queued = session["withSyncTask"](peer)
    expect(peer).not.toHaveBeenCalled()
    release()
    await cloud
    await queued
    expect(peer).toHaveBeenCalledOnce()
    await expect(
      session["withSyncTask"](async () => {
        throw new Error("offline")
      })
    ).rejects.toThrow("offline")
    await expect(session["withSyncTask"](async () => "next")).resolves.toBe(
      "next"
    )
  })
  it("fetches divergent history with local edits without saving, merging or uploading", async () => {
    const { graft, session, invoke } = sessionFixture(2, 3, true)
    expect(await invoke("fetch")).toMatchObject({
      state: "checked",
      pulled: false,
      pushed: false,
    })
    expect(graft.fetch).toHaveBeenCalledOnce()
    expect(graft.push).not.toHaveBeenCalled()
    expect(graft.stageAll).not.toHaveBeenCalled()
    expect(graft.commit).not.toHaveBeenCalled()
    expect(graft.applyMerge).not.toHaveBeenCalled()
    expect(session["completeResolvedMerge"]).not.toHaveBeenCalled()
  })

  it("uploads saved versions while leaving local edits unstaged", async () => {
    const { graft, invoke } = sessionFixture(2, 0, true)
    expect(await invoke("push")).toMatchObject({ pushed: true, pulled: false })
    expect(graft.push).toHaveBeenCalledOnce()
    expect(graft.fetch).not.toHaveBeenCalled()
    expect(graft.stageAll).not.toHaveBeenCalled()
    expect(graft.commit).not.toHaveBeenCalled()
    expect(graft.applyMerge).not.toHaveBeenCalled()
  })

  it("does not upload when receiving from an already current remote", async () => {
    const { graft, invoke } = sessionFixture(2, 0, false)
    expect(await invoke("pull")).toMatchObject({
      state: "checked",
      pushed: false,
      pulled: false,
    })
    expect(graft.push).not.toHaveBeenCalled()
  })

  it("reconciles a lost upload race by fetching and reclassifying", async () => {
    const { graft, invoke } = sessionFixture(2, 0, false)
    graft.status
      .mockResolvedValueOnce({
        ahead: 2,
        behind: 0,
        dirty: false,
        hasConflicts: false,
      })
      .mockResolvedValueOnce({
        ahead: 2,
        behind: 0,
        dirty: false,
        hasConflicts: false,
      })
      .mockResolvedValueOnce({
        ahead: 0,
        behind: 2,
        dirty: false,
        hasConflicts: false,
      })
    graft.push.mockRejectedValueOnce(new Error("Remote head changed (CAS)"))

    expect(await invoke("push")).toMatchObject({
      state: "checked",
      pushed: false,
      pulled: false,
    })
    expect(graft.push).toHaveBeenCalledTimes(1)
    expect(graft.fetch).toHaveBeenCalledTimes(1)
    expect(graft.applyMerge).not.toHaveBeenCalled()
    expect(graft.commit).not.toHaveBeenCalled()
  })

  it("retries a lost upload race once when the remote head is unchanged", async () => {
    const { graft, invoke } = sessionFixture(2, 0, false)
    graft.push.mockRejectedValueOnce(new Error("Remote head changed (CAS)"))
    expect(await invoke("push")).toMatchObject({
      state: "synced",
      pushed: true,
      pulled: false,
    })
    expect(graft.push).toHaveBeenCalledTimes(2)
    expect(graft.fetch).toHaveBeenCalledTimes(1)
  })

  it("propagates a definitive upload failure without fetching", async () => {
    const { graft, invoke } = sessionFixture(2, 0, false)
    graft.push.mockRejectedValueOnce(
      Object.assign(
        new Error(
          "Object upload completed but ref publication failed with HTTP 500"
        ),
        { code: "GRAFT_SDK_REPOSITORY_COMMAND" }
      )
    )
    await expect(invoke("push")).rejects.toThrow("ref publication failed")
    expect(graft.push).toHaveBeenCalledTimes(1)
    expect(graft.fetch).not.toHaveBeenCalled()
    expect(graft.applyMerge).not.toHaveBeenCalled()
    expect(graft.commit).not.toHaveBeenCalled()
  })

  it("does not receive remote files when upload discovers newer remote versions", async () => {
    const { graft, invoke } = sessionFixture(0, 2, true)
    expect(await invoke("push")).toMatchObject({
      state: "checked",
      pushed: false,
      pulled: false,
    })
    expect(graft.push).not.toHaveBeenCalled()
    expect(graft.applyMerge).not.toHaveBeenCalled()
  })

  it("protects local edits before receiving remote files", async () => {
    const { graft, invoke } = sessionFixture(0, 2, true)
    await expect(invoke("pull")).rejects.toThrow("checkpoint")
    expect(graft.applyMerge).not.toHaveBeenCalled()
  })
})
