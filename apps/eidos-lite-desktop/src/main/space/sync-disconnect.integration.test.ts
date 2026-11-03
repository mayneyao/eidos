import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SpaceSession } from "./space-session"
import { SpaceSyncStateStore } from "./sync-state"
import { SpaceSyncConnectionStore } from "./sync-connection"
import {
  RememberedSyncUnlocks,
  RememberedSyncUnlockStore,
} from "../sync/remembered-sync-unlocks"

describe("disconnect cloud sync without changing the Space", () => {
  it("locally disconnects another official environment without an account request", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "lite-cross-environment-disconnect-")
    )
    const root = path.join(directory, "Space")
    const userData = path.join(directory, "profile")
    await fs.mkdir(root)
    await fs.writeFile(path.join(root, "note.md"), "saved version\n")
    const production = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
      syncRemoteOrigin: "https://sync.eidos.space",
    })
    const staging = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
      syncRemoteOrigin: "https://sync-staging.eidos.space",
    })
    let session: SpaceSession | undefined
    try {
      session = await SpaceSession.create(root, userData, { graft: production })
      await session.enableVersioning()
      const before = await production.history(root)
      const stateDirectory = path.join(userData, "spaces", session.canonical.id)
      const remote = "https://sync.eidos.space/u-test/production-space"
      await production.configureOfficialRemote(root, remote, "synthetic-token")
      await new SpaceSyncStateStore(
        stateDirectory,
        production.syncRemoteOrigin
      ).markFirstPush(remote)
      await fs.writeFile(path.join(root, "note.md"), "unsaved edits\n")
      await session.close()
      session = undefined
      await production.close()
      session = await SpaceSession.create(root, userData, { graft: staging })
      const accountSubject = vi.fn(async (): Promise<string> => {
        throw new Error("No official account request is needed to disconnect")
      })
      const unlocks = new RememberedSyncUnlocks(
        {
          accountSubject,
          repositories: vi.fn(async () => ({
            namespace: "u-test",
            repositories: [],
          })),
        },
        "https://staging.eidos.space",
        path.join(userData, "encrypted-sync", "staging"),
        new RememberedSyncUnlockStore(
          path.join(userData, "remembered-sync", "staging"),
          {
            isAvailable: () => false,
            encrypt: () => {
              throw new Error("Unexpected credential write")
            },
            decrypt: () => {
              throw new Error("Unexpected credential read")
            },
          }
        )
      )
      await unlocks.disconnect(session)
      const snapshot = await session.disconnectHostedSync()
      expect(accountSubject).not.toHaveBeenCalled()
      expect(snapshot.cloudSyncConnection).toBe(false)
      expect(snapshot.graft.initialized).toBe(true)
      expect(snapshot.graft.clean).toBe(false)
      expect(await staging.remoteUrl(root)).toBeNull()
      expect(await staging.history(root)).toEqual(before)
      expect(await fs.readFile(path.join(root, "note.md"), "utf8")).toBe(
        "unsaved edits\n"
      )
    } finally {
      await session?.close()
      await production.close()
      await staging.close()
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
  it("can discard an unfinished enrollment after restart before origin exists", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "lite-pending-disconnect-")
    )
    const root = path.join(directory, "Space")
    const userData = path.join(directory, "profile")
    await fs.mkdir(root)
    await fs.writeFile(path.join(root, "note.md"), "keep local edits")
    const graft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
    })
    let session: SpaceSession | undefined
    try {
      session = await SpaceSession.create(root, userData, { graft })
      await session.enableVersioning()
      const pending = await session.hostedSyncRepositoryName()
      await session.close()
      session = await SpaceSession.create(root, userData, { graft })
      expect((await session.refresh()).cloudSyncConnection).toBe(true)
      const result = await session.disconnectHostedSync()
      expect(result.cloudSyncConnection).toBe(false)
      expect(await session.hostedSyncRepositoryName()).not.toBe(pending)
      expect(await fs.readFile(path.join(root, "note.md"), "utf8")).toBe(
        "keep local edits"
      )
    } finally {
      await session?.close()
      await graft.close()
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
  it.each([false, true])(
    "preserves history and dirty files when origin was manually removed: %s",
    async (manuallyRemoved) => {
      const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), "lite-disconnect-")
      )
      const root = path.join(directory, "Space")
      const userData = path.join(directory, "profile")
      await fs.mkdir(root)
      await fs.writeFile(path.join(root, "note.md"), "first version\n")
      const graft = new GraftClient({
        sdkTransport: new GraftInProcessTransport(),
      })
      let session: SpaceSession | undefined
      try {
        session = await SpaceSession.create(root, userData, { graft })
        await session.enableVersioning()
        await fs.writeFile(path.join(root, "note.md"), "second version\n")
        await session.createCheckpoint("second version")
        const before = await graft.history(root)
        const folder = await fs.stat(root)
        const id = session.canonical.id
        const stateDirectory = path.join(userData, "spaces", id)
        const remote = `https://sync-staging.eidos.space/u-test/${id}`
        await graft.configureOfficialRemote(root, remote, "synthetic-token")
        await new SpaceSyncStateStore(
          stateDirectory,
          graft.syncRemoteOrigin
        ).markFirstPush(remote)
        await fs.writeFile(path.join(stateDirectory, "sync-queue.json"), "{}")
        await fs.writeFile(path.join(root, "note.md"), "unsaved local edits\n")
        if (manuallyRemoved) await graft.removeRemote(root)
        const snapshot = await session.disconnectHostedSync()
        expect(snapshot.graft.sync).toBeUndefined()
        expect(snapshot.graft.initialized).toBe(true)
        expect(snapshot.graft.clean).toBe(false)
        expect(await session.officialSyncRemoteUrl()).toBeNull()
        expect(await graft.remoteUrl(root)).toBeNull()
        expect(await graft.history(root)).toEqual(before)
        expect(await fs.readFile(path.join(root, "note.md"), "utf8")).toBe(
          "unsaved local edits\n"
        )
        expect((await fs.stat(root)).ino).toBe(folder.ino)
        const next = await session.hostedSyncRepositoryName()
        expect(next).not.toBe(id)
        await session.close()
        session = await SpaceSession.create(root, userData, { graft })
        expect(session.canonical.id).toBe(id)
        expect(await session.hostedSyncRepositoryName()).toBe(next)
        expect(await graft.history(root)).toEqual(before)
        const approval = {
          manifestId: (await session.syncPreflight()).manifestId,
        }
        await session.prepareHostedSync(approval, true)
        await expect(
          session.assertHostedSyncReady(true)
        ).resolves.toBeUndefined()
      } finally {
        await session?.close()
        await graft.close()
        await fs.rm(directory, { recursive: true, force: true })
      }
    }
  )

  it("finishes an interrupted disconnect on startup, keeping the new connection ID", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "lite-disconnect-recovery-")
    )
    const root = path.join(directory, "Space")
    const userData = path.join(directory, "profile")
    await fs.mkdir(root)
    await fs.writeFile(path.join(root, "note.md"), "keep history")
    const graft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
    })
    let session: SpaceSession | undefined
    try {
      session = await SpaceSession.create(root, userData, { graft })
      await session.enableVersioning()
      const history = await graft.history(root)
      const stateDirectory = path.join(userData, "spaces", session.canonical.id)
      const remote = "https://sync-staging.eidos.space/u-test/deleted"
      await graft.configureOfficialRemote(root, remote, "synthetic-token")
      await new SpaceSyncStateStore(
        stateDirectory,
        graft.syncRemoteOrigin
      ).markFirstPush(remote)
      const intent = await new SpaceSyncConnectionStore(
        stateDirectory
      ).beginDisconnect(remote)
      await session.close()
      session = await SpaceSession.create(root, userData, { graft })
      expect(await session.officialSyncRemoteUrl()).toBeNull()
      expect(await session.hostedSyncRepositoryName()).toBe(intent.repository)
      expect(await graft.history(root)).toEqual(history)
    } finally {
      await session?.close()
      await graft.close()
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
})
