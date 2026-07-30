import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { GraftClient } from "../graft/graft-client"
import { canonicalizeSpaceRoot } from "../space/space-paths"
import { SpaceSession } from "../space/space-session"
import { SpaceSyncStateStore } from "../space/sync-state"
import { BackgroundSyncQueue } from "./background-sync-queue"
import type { SyncControlPlane } from "./sync-control-plane"
import { SyncExecutor } from "./sync-executor"
import { SyncQueueStore } from "./sync-queue-store"

const origin = "https://sync-staging.eidos.space"
const remoteUrl = `${origin}/u-test/publish-failure`
const accessToken = "memory-only-push-token"
const localHead = "a".repeat(64)

describe("push publication failure", () => {
  it("keeps local state and queues one retry when ref publication fails", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-push-failure-")
    )
    const space = path.join(root, "space")
    const userData = path.join(root, "user-data")
    await fs.mkdir(space)
    const ordinaryPath = path.join(space, "notes.txt")
    await fs.writeFile(ordinaryPath, "local checkpoint content\n")
    const canonical = await canonicalizeSpaceRoot(space)
    await new SpaceSyncStateStore(
      path.join(userData, "spaces", canonical.id),
      origin
    ).markFirstPush(remoteUrl)

    const relation = {
      dirty: false,
      currentHead: localHead,
      currentBranch: "main",
      ahead: 1,
      behind: 0,
      hasConflicts: false,
    }
    const publicationFailure = Object.assign(
      new Error(
        "Object upload completed but ref publication failed with HTTP 500"
      ),
      { code: "GRAFT_SDK_REPOSITORY_COMMAND" }
    )
    const graft = {
      syncRemoteOrigin: origin,
      open: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      inspectSpace: vi.fn(async () => ({
        available: true,
        backend: "sdk" as const,
        version: "0.3.0",
        expectedVersion: "0.3.0",
        initialized: true,
        clean: true,
        currentHead: localHead,
      })),
      remoteUrl: vi.fn(async () => remoteUrl),
      configureOfficialRemote: vi.fn(
        async (_root: string, receivedRemote: string, token: string) => {
          expect(receivedRemote).toBe(remoteUrl)
          expect(token).toBe(accessToken)
        }
      ),
      fetch: vi.fn(async () => undefined),
      status: vi.fn(async () => ({ ...relation })),
      push: vi.fn(async () => {
        throw publicationFailure
      }),
    } as unknown as GraftClient
    const control = {
      repositoryAccess: vi.fn(async () => ({
        accessToken,
        access: "read_write" as const,
      })),
    } as unknown as SyncControlPlane
    const store = new SyncQueueStore(userData)
    const scheduled: Array<() => Promise<void>> = []
    const queue = new BackgroundSyncQueue({
      store,
      now: () => 10_000,
      schedule: (task) => {
        scheduled.push(task)
        return task
      },
      cancel: () => undefined,
    })
    let session: SpaceSession | null = null

    try {
      session = await SpaceSession.create(space, userData, { graft })
      const closeHandles = vi.spyOn(session.runtimePool, "closeHandles")
      const executor = new SyncExecutor(control)
      await queue.attach({
        spaceId: canonical.id,
        execute: () => executor.run(session!, () => undefined),
        emit: () => undefined,
      })

      const response = await queue.runNow(canonical.id)

      expect(response).toMatchObject({
        ok: false,
        failure: {
          code: "remote-persistence-failed",
          status: 500,
          retryable: true,
          localSafe: true,
        },
      })
      expect(queue.status(canonical.id)).toMatchObject({
        state: "retry-wait",
        attempt: 1,
        lastFailure: { code: "remote-persistence-failed" },
      })
      expect(scheduled).toHaveLength(1)
      expect(graft.push).toHaveBeenCalledTimes(1)
      expect(graft.status).toHaveBeenCalledTimes(3)
      expect(closeHandles).not.toHaveBeenCalled()
      expect(session.gate.current()).toMatchObject({
        phase: "ready",
        recoverable: true,
      })
      await expect(fs.readFile(ordinaryPath, "utf8")).resolves.toBe(
        "local checkpoint content\n"
      )
      const persistedQueue = await fs.readFile(
        path.join(userData, "spaces", canonical.id, "sync-queue.json"),
        "utf8"
      )
      expect(persistedQueue).not.toContain(accessToken)
      expect(persistedQueue).not.toContain(remoteUrl)
    } finally {
      await queue.close()
      await session?.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
