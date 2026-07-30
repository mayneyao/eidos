import { fork, type ChildProcess } from "node:child_process"
import { once } from "node:events"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { openEidosFile } from "@eidos.space/eidos-file/better-sqlite3"

import type { GraftClient } from "../graft/graft-client"
import { canonicalizeSpaceRoot } from "../space/space-paths"
import { SpaceSession } from "../space/space-session"
import { SpaceSyncStateStore } from "../space/sync-state"
import { BackgroundSyncQueue } from "./background-sync-queue"
import type { SyncControlPlane } from "./sync-control-plane"
import { SyncExecutor } from "./sync-executor"
import { SyncQueueStore } from "./sync-queue-store"

const fixture = fileURLToPath(
  new URL("./fixtures/push-publication-crash.ts", import.meta.url)
)
const tsxLoader = createRequire(import.meta.url).resolve("tsx")
const projectFixture = fileURLToPath(
  new URL(
    "../../../../eidos-file-web/fixtures/project-tracker.eidos",
    import.meta.url
  )
)
const origin = "https://sync-staging.eidos.space"
const remoteUrl = `${origin}/u-test/process-crash`
const localHead = "a".repeat(64)

function waitForPushPublication(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = ""
    const timeout = setTimeout(() => {
      reject(new Error(`push publication child timed out: ${stderr}`))
    }, 10_000)
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk)
    })
    child.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once("exit", (code, signal) => {
      clearTimeout(timeout)
      reject(
        new Error(
          `push publication child exited before signal (${code ?? signal}): ${stderr}`
        )
      )
    })
    child.on("message", (message) => {
      if (
        typeof message === "object" &&
        message !== null &&
        "phase" in message &&
        message.phase === "push-publication"
      ) {
        clearTimeout(timeout)
        resolve()
      }
    })
  })
}

describe("push publication process crash recovery", () => {
  it.each([
    { remotePublished: false, expectedPushes: 1 },
    { remotePublished: true, expectedPushes: 0 },
  ])(
    "reconciles a terminated push when remotePublished=$remotePublished",
    async ({ remotePublished, expectedPushes }) => {
      const root = await fs.mkdtemp(
        path.join(os.tmpdir(), "eidos-lite-push-process-crash-")
      )
      const space = path.join(root, "space")
      const userData = path.join(root, "user-data")
      await fs.mkdir(space)
      const ordinaryPath = path.join(space, "notes.txt")
      const eidosPath = path.join(space, "project.eidos")
      await Promise.all([
        fs.writeFile(ordinaryPath, "local checkpoint content\n"),
        fs.copyFile(projectFixture, eidosPath),
      ])
      const originalEidos = await fs.readFile(eidosPath)
      const canonical = await canonicalizeSpaceRoot(space)
      await new SpaceSyncStateStore(
        path.join(userData, "spaces", canonical.id),
        origin
      ).markFirstPush(remoteUrl)
      const child = fork(fixture, [userData, canonical.id, remoteUrl], {
        execArgv: ["--import", tsxLoader],
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      })
      let queue: BackgroundSyncQueue | null = null
      let session: SpaceSession | null = null

      try {
        await waitForPushPublication(child)
        expect(child.kill("SIGKILL")).toBe(true)
        await once(child, "exit")

        const store = new SyncQueueStore(userData)
        await expect(store.read(canonical.id)).resolves.toMatchObject({
          state: "running",
          trigger: "manual",
          attempt: 0,
        })
        const persistedRunning = await fs.readFile(
          path.join(userData, "spaces", canonical.id, "sync-queue.json"),
          "utf8"
        )
        expect(persistedRunning).not.toContain("process-only-crash-token")
        expect(persistedRunning).not.toContain(remoteUrl)
        await expect(fs.readFile(ordinaryPath, "utf8")).resolves.toBe(
          "local checkpoint content\n"
        )
        await expect(fs.readFile(eidosPath)).resolves.toEqual(originalEidos)
        const readonly = openEidosFile(eidosPath, { readonly: true })
        try {
          expect(readonly.validate({ level: "full" })).toMatchObject({
            valid: true,
          })
        } finally {
          readonly.close()
        }

        let pushed = false
        const relation = () => ({
          dirty: false,
          currentHead: localHead,
          currentBranch: "main",
          ahead: remotePublished || pushed ? 0 : 1,
          behind: 0,
          hasConflicts: false,
        })
        const push = vi.fn(async () => {
          pushed = true
        })
        const graft = {
          syncRemoteOrigin: origin,
          expectedVersion: vi.fn(() => "0.3.0"),
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
          configureOfficialRemote: vi.fn(async () => undefined),
          fetch: vi.fn(async () => undefined),
          status: vi.fn(async () => relation()),
          push,
        } as unknown as GraftClient
        const recoveryToken = "fresh-process-memory-token"
        const control = {
          repositoryAccess: vi.fn(async () => ({
            accessToken: recoveryToken,
            access: "read_write" as const,
          })),
        } as unknown as SyncControlPlane
        const scheduled: Array<() => Promise<void>> = []
        queue = new BackgroundSyncQueue({
          store,
          schedule: (task) => {
            scheduled.push(task)
            return task
          },
          cancel: () => undefined,
        })
        session = await SpaceSession.create(space, userData, { graft })
        const executor = new SyncExecutor(control)
        const recovered = await queue.attach({
          spaceId: canonical.id,
          execute: () => executor.run(session!, () => undefined),
          emit: () => undefined,
        })

        expect(recovered).toMatchObject({
          state: "pending",
          trigger: "crash-recovery",
          attempt: 0,
        })
        expect(scheduled).toHaveLength(1)
        const persistedRecovery = await fs.readFile(
          path.join(userData, "spaces", canonical.id, "sync-queue.json"),
          "utf8"
        )
        expect(persistedRecovery).not.toContain(recoveryToken)
        expect(persistedRecovery).not.toContain(remoteUrl)

        await scheduled[0]!()

        expect(push).toHaveBeenCalledTimes(expectedPushes)
        expect(queue.status(canonical.id).state).toBe("idle")
        await expect(store.read(canonical.id)).resolves.toBeNull()
        await expect(fs.readFile(ordinaryPath, "utf8")).resolves.toBe(
          "local checkpoint content\n"
        )
        await expect(fs.readFile(eidosPath)).resolves.toEqual(originalEidos)
        expect(session.gate.current()).toMatchObject({ phase: "ready" })
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill()
        await queue?.close()
        await session?.close()
        await fs.rm(root, { recursive: true, force: true })
      }
    }
  )
})
