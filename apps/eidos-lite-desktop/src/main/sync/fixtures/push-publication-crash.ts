import type { SpaceSession } from "../../space/space-session"
import { BackgroundSyncQueue } from "../background-sync-queue"
import type { SyncControlPlane } from "../sync-control-plane"
import { SyncExecutor } from "../sync-executor"
import { SyncQueueStore } from "../sync-queue-store"

const [userData, spaceId, remoteUrl] = process.argv.slice(2)
if (!userData || !spaceId || !remoteUrl) {
  throw new Error(
    "push publication crash fixture requires userData, Space id and Remote URL"
  )
}

const accessToken = "process-only-crash-token"
const localHead = "a".repeat(64)
const control = {
  repositoryAccess: async () => ({
    accessToken,
    access: "read_write" as const,
  }),
} as unknown as SyncControlPlane
const session = {
  officialSyncRemoteUrl: async () => remoteUrl,
  syncHostedRemote: async (
    receivedToken: string,
    access: "read_only" | "read_write",
    reportProgress: (phase: string, detail: string) => void
  ) => {
    if (receivedToken !== accessToken || access !== "read_write") {
      throw new Error("push publication crash fixture received invalid access")
    }
    reportProgress("fetch", "Fetching Hosted Space history")
    reportProgress("analyze", "Comparing Local and Hosted checkpoints")
    reportProgress("push", "Pushing Local checkpoints to Hosted Space")
    process.send?.({ phase: "push-publication" })
    await new Promise<never>(() => {
      setInterval(() => undefined, 1_000)
    })
    return {
      state: "synced" as const,
      message: "Synced",
      pulled: false,
      pushed: true,
      ahead: 0,
      behind: 0,
      snapshot: { graft: { currentHead: localHead } },
    }
  },
} as unknown as SpaceSession
const queue = new BackgroundSyncQueue({ store: new SyncQueueStore(userData) })
const executor = new SyncExecutor(control)

await queue.attach({
  spaceId,
  execute: () => executor.run(session, () => undefined),
  emit: () => undefined,
})
await queue.runNow(spaceId)
