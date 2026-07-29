import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { SpaceSyncStateStore } from "./sync-state"

const origin = "https://sync-staging.eidos.space"
const remoteUrl = `${origin}/u-alice/project`

describe("SpaceSyncStateStore", () => {
  let root = ""

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-sync-state-"))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it("claims Sync only after a trusted first push is recorded", async () => {
    const store = new SpaceSyncStateStore(root, origin)
    await expect(store.read()).resolves.toBeNull()
    await store.markFirstPush(remoteUrl, new Date("2026-07-28T04:00:00.000Z"))
    await expect(store.read()).resolves.toEqual({
      version: 2,
      remoteUrl,
      connectedAt: "2026-07-28T04:00:00.000Z",
      establishedBy: "first-push",
    })
  })

  it("distinguishes a validated clone from a first push", async () => {
    const store = new SpaceSyncStateStore(root, origin)
    await store.markClone(remoteUrl, new Date("2026-07-28T05:00:00.000Z"))
    await expect(store.read()).resolves.toEqual({
      version: 2,
      remoteUrl,
      connectedAt: "2026-07-28T05:00:00.000Z",
      establishedBy: "clone",
    })
  })

  it("reads the version 1 first-push marker without weakening validation", async () => {
    await fs.writeFile(
      path.join(root, "sync-state.json"),
      JSON.stringify({
        version: 1,
        remoteUrl,
        firstPushedAt: "2026-07-28T04:00:00.000Z",
      })
    )
    await expect(new SpaceSyncStateStore(root, origin).read()).resolves.toEqual(
      {
        version: 2,
        remoteUrl,
        connectedAt: "2026-07-28T04:00:00.000Z",
        establishedBy: "first-push",
      }
    )
  })

  it("rejects cross-environment state instead of reporting Synced", async () => {
    const store = new SpaceSyncStateStore(root, origin)
    await expect(
      store.markFirstPush("https://sync.eidos.space/u-alice/project")
    ).rejects.toThrow("untrusted")
  })
})
