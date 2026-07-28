import type { SpaceSession } from "../space/space-session"
import type { SyncControlPlane } from "./sync-control-plane"
import { SyncExecutor } from "./sync-executor"
import { PACKAGED_SYNC_FAILURE_SEQUENCE } from "./sync-failure"

describe("SyncExecutor packaged failure matrix", () => {
  it("classifies every injected Remote failure before touching the Space", async () => {
    const session = {
      officialSyncRemoteUrl: vi.fn(() => {
        throw new Error("Injected failures must not inspect the repository")
      }),
      syncHostedRemote: vi.fn(() => {
        throw new Error("Injected failures must not materialize the worktree")
      }),
    } as unknown as SpaceSession
    const control = {
      repositoryAccess: vi.fn(() => {
        throw new Error("Injected failures must not contact account services")
      }),
    } as unknown as SyncControlPlane
    const executor = new SyncExecutor(control, PACKAGED_SYNC_FAILURE_SEQUENCE)

    for (const expected of PACKAGED_SYNC_FAILURE_SEQUENCE) {
      const response = await executor.run(session, () => undefined)
      expect(response).toMatchObject({
        ok: false,
        failure: {
          code: expected.code,
          localSafe: true,
          ...(expected.status === undefined ? {} : { status: expected.status }),
          ...(expected.retryAfterMs === undefined
            ? {}
            : { retryAfterMs: expected.retryAfterMs }),
        },
      })
    }

    expect(session.officialSyncRemoteUrl).not.toHaveBeenCalled()
    expect(session.syncHostedRemote).not.toHaveBeenCalled()
    expect(control.repositoryAccess).not.toHaveBeenCalled()
  })
})
