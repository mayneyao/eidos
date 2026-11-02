import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SpaceSession } from "./space-session"
import { SpaceSyncStateStore } from "./sync-state"
import { SyncSwitchJournal } from "./sync-switch"

it("restores an encrypted Graft origin on failure and after an interrupted switch", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lite-switch-"))
  const root = path.join(directory, "Space")
  const profile = path.join(directory, "profile")
  await fs.mkdir(root)
  await fs.writeFile(path.join(root, "note.txt"), "local file stays\n")
  const graft = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
  let session = await SpaceSession.create(root, profile, { graft })
  const previous = "https://old.example/personal/repository"
  const target = "https://new.example/personal/repository"
  const uuid = "00010203-0405-4607-8809-0a0b0c0d0e0f"
  try {
    await session.enableVersioning()
    await graft.restoreEncryptedSyncBinding(root, previous, uuid, profile)
    const stateDirectory = path.join(profile, "spaces", session.canonical.id)
    await new SpaceSyncStateStore(
      stateDirectory,
      graft.syncRemoteOrigin
    ).markFirstPush(previous, new Date(), uuid)
    const before = await graft.history(root)
    const failingUpload = vi
      .spyOn(graft, "encryptedSync")
      .mockRejectedValue(new Error("Target unavailable"))
    await expect(
      session.enableHostedSync(
        target,
        "test",
        { manifestId: (await session.syncPreflight()).manifestId },
        () => undefined,
        {
          connection: {
            url: target,
            uuid,
            authenticationDomain: "https://new.example",
            accountSubject: "personal",
            bearerToken: "test",
            stateDirectory: directory,
          },
          password: Buffer.from("test-password"),
        },
        () => undefined,
        undefined,
        { remoteUrl: previous, encryptionUuid: uuid }
      )
    ).rejects.toThrow("Target unavailable")
    failingUpload.mockRestore()
    expect(await session.officialSyncRemoteUrl()).toBe(previous)
    expect(await graft.isEncryptedRemote(root)).toBe(true)
    expect(await graft.history(root)).toEqual(before)
    await new SyncSwitchJournal(stateDirectory).begin({
      previous,
      target,
      encryptionUuid: uuid,
    })
    await graft.removeRemote(root)
    await session.close()
    session = await SpaceSession.create(root, profile, { graft })
    expect(await session.officialSyncRemoteUrl()).toBe(previous)
    expect(await graft.isEncryptedRemote(root)).toBe(true)
    expect(await fs.readFile(path.join(root, "note.txt"), "utf8")).toBe(
      "local file stays\n"
    )
  } finally {
    await session.close()
    await graft.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
}, 30_000)
