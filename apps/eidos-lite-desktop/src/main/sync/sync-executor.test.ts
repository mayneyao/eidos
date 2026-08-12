import type { EidosSyncProgress, SpaceSnapshot } from "../../shared/contracts"
import type { SpaceSession } from "../space/space-session"
import type { SyncControlPlane } from "./sync-control-plane"
import { SyncExecutor } from "./sync-executor"
import { PACKAGED_SYNC_FAILURE_SEQUENCE } from "./sync-failure"

describe("SyncExecutor packaged failure matrix", () => {
  it("emits real transfer bytes reported by the hosted remote operation", async () => {
    const session = {
      officialSyncRemoteUrl: vi.fn(
        async () => "https://sync-staging.eidos.space/person/repository"
      ),
      syncHostedRemote: vi.fn(
        async (
          _token: string,
          _access: "read_only" | "read_write",
          reportProgress: (phase: "push", detail: string) => void,
          reportTransfer: (progress: {
            direction: "upload"
            transferredBytes: number
            totalBytes?: number
          }) => void
        ) => {
          reportProgress("push", "Publishing current Local checkpoints")
          reportTransfer({
            direction: "upload",
            transferredBytes: 64 * 1024 * 1024,
            totalBytes: 128 * 1024 * 1024,
          })
          return {
            state: "synced" as const,
            message: "Local and Hosted Space history are up to date.",
            pulled: false,
            pushed: true,
            ahead: 0,
            behind: 0,
            snapshot: {} as SpaceSnapshot,
          }
        }
      ),
    } as unknown as SpaceSession
    const control = {
      repositoryAccess: vi.fn(async () => ({
        accessToken: "memory-only-token",
        access: "read_write" as const,
      })),
    } as unknown as SyncControlPlane
    const progress: EidosSyncProgress[] = []

    const response = await new SyncExecutor(control).run(session, (event) =>
      progress.push(event)
    )

    expect(response.ok).toBe(true)
    expect(progress).toContainEqual(
      expect.objectContaining({
        state: "active",
        phase: "push",
        transfer: expect.objectContaining({
          direction: "upload",
          transferredBytes: 64 * 1024 * 1024,
          totalBytes: 128 * 1024 * 1024,
        }),
      })
    )
  })

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
