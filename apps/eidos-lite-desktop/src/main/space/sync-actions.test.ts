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
  const invoke = (action: EidosSyncAction) =>
    SpaceSession.prototype.syncHostedRemote.call(
      session,
      "token",
      "read_write",
      () => undefined,
      () => undefined,
      action
    )
  return { graft, session, invoke }
}

describe("explicit Sync actions", () => {
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

  it("surfaces a rejected optimistic upload without fetching or applying remote files", async () => {
    const { graft, invoke } = sessionFixture(2, 0, false)
    graft.push.mockRejectedValueOnce(new Error("Remote head changed (CAS)"))
    await expect(invoke("push")).rejects.toThrow("Remote head changed")
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
