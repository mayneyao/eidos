import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { EidosSyncProgress, SpaceSnapshot } from "../../shared/contracts"
import type { SpaceSession } from "../space/space-session"
import { BackgroundSyncQueue } from "./background-sync-queue"
import type { SyncControlPlane } from "./sync-control-plane"
import { SyncExecutor } from "./sync-executor"
import { SyncQueueStore } from "./sync-queue-store"

const spaceId = "entitlement-restoration-space"
const remoteUrl = "https://sync-staging.eidos.space/u-test/entitlement"
const accessToken = "restored-memory-only-token"

describe("Sync entitlement restoration", () => {
  it("keeps paused checkpoint state and clears it only after restored Sync", async () => {
    const state = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-entitlement-")
    )
    const store = new SyncQueueStore(state)
    let entitlementRestored = false
    const syncHostedRemote = vi.fn(
      async (
        _token: string,
        _access: "read_only" | "read_write",
        reportProgress: (phase: "push", detail: string) => void
      ) => {
        reportProgress("push", "Publishing current Local checkpoints")
        if (!entitlementRestored) {
          throw Object.assign(
            new Error("Subscription expired before ref publication"),
            { code: "entitlement-inactive" }
          )
        }
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
    )
    const session = {
      officialSyncRemoteUrl: vi.fn(async () => remoteUrl),
      syncHostedRemote,
    } as unknown as SpaceSession
    const control = {
      repositoryAccess: vi.fn(async () => ({
        accessToken,
        access: "read_write" as const,
      })),
    } as unknown as SyncControlPlane
    const executor = new SyncExecutor(control)
    const progress: EidosSyncProgress[] = []
    const queue = new BackgroundSyncQueue({
      store,
      now: () => 10_000,
      schedule: () => {
        throw new Error("Entitlement failures must not auto-retry")
      },
      cancel: () => undefined,
    })

    try {
      await queue.attach({
        spaceId,
        execute: () => executor.run(session, (event) => progress.push(event)),
        emit: () => undefined,
      })

      const expired = await queue.runNow(spaceId)

      expect(expired).toMatchObject({
        ok: false,
        failure: {
          code: "entitlement-inactive",
          retryable: false,
          localSafe: true,
        },
        telemetry: {
          phases: [{ phase: "authorization" }, { phase: "push" }],
        },
      })
      expect(progress.at(-1)).toMatchObject({
        state: "failed",
        phase: "push",
      })
      expect(queue.status(spaceId)).toMatchObject({
        state: "paused",
        attempt: 1,
        lastFailure: { code: "entitlement-inactive" },
      })
      expect(await store.read(spaceId)).toMatchObject({
        state: "paused",
        attempt: 1,
        lastFailure: { code: "entitlement-inactive" },
      })
      const pausedBytes = await fs.readFile(
        path.join(state, "spaces", spaceId, "sync-queue.json"),
        "utf8"
      )
      expect(pausedBytes).not.toContain(accessToken)

      entitlementRestored = true
      const restored = await queue.runNow(spaceId)

      expect(restored).toMatchObject({
        ok: true,
        result: { state: "synced", pushed: true },
      })
      expect(syncHostedRemote).toHaveBeenCalledTimes(2)
      expect(queue.status(spaceId).state).toBe("idle")
      await expect(store.read(spaceId)).resolves.toBeNull()
    } finally {
      await queue.close()
      await fs.rm(state, { recursive: true, force: true })
    }
  })
})
