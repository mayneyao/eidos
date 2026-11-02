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
      version: 3,
      remoteUrl,
      connectedAt: "2026-07-28T04:00:00.000Z",
      establishedBy: "first-push",
      lastCheckedAt: "2026-07-28T04:00:00.000Z",
    })
  })

  it("distinguishes a validated clone from a first push", async () => {
    const store = new SpaceSyncStateStore(root, origin)
    await store.markClone(remoteUrl, new Date("2026-07-28T05:00:00.000Z"))
    await expect(store.read()).resolves.toEqual({
      version: 3,
      remoteUrl,
      connectedAt: "2026-07-28T05:00:00.000Z",
      establishedBy: "clone",
      lastCheckedAt: "2026-07-28T05:00:00.000Z",
    })
  })

  it("updates the last verified cloud check without changing connection history", async () => {
    const store = new SpaceSyncStateStore(root, origin)
    await store.markClone(remoteUrl, new Date("2026-07-28T05:00:00.000Z"))

    await expect(
      store.markChecked(new Date("2026-07-29T06:30:00.000Z"))
    ).resolves.toEqual({
      version: 3,
      remoteUrl,
      connectedAt: "2026-07-28T05:00:00.000Z",
      establishedBy: "clone",
      lastCheckedAt: "2026-07-29T06:30:00.000Z",
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
        version: 3,
        remoteUrl,
        connectedAt: "2026-07-28T04:00:00.000Z",
        establishedBy: "first-push",
        lastCheckedAt: "2026-07-28T04:00:00.000Z",
      }
    )
  })

  it("migrates the version 2 connection marker to a checked history state", async () => {
    await fs.writeFile(
      path.join(root, "sync-state.json"),
      JSON.stringify({
        version: 2,
        remoteUrl,
        connectedAt: "2026-07-28T05:00:00.000Z",
        establishedBy: "clone",
      })
    )

    await expect(new SpaceSyncStateStore(root, origin).read()).resolves.toEqual(
      {
        version: 3,
        remoteUrl,
        connectedAt: "2026-07-28T05:00:00.000Z",
        establishedBy: "clone",
        lastCheckedAt: "2026-07-28T05:00:00.000Z",
      }
    )
  })

  it("rejects cross-environment state instead of reporting Synced", async () => {
    const store = new SpaceSyncStateStore(root, origin)
    await expect(
      store.markFirstPush("https://sync.eidos.space/u-alice/project")
    ).rejects.toThrow("untrusted")
  })
  it("reads another official environment only for local disconnection", async () => {
    const production = new SpaceSyncStateStore(root, "https://sync.eidos.space")
    const state = await production.markFirstPush(
      "https://sync.eidos.space/u-alice/project"
    )
    const staging = new SpaceSyncStateStore(root, origin)
    await expect(staging.read()).rejects.toThrow("invalid")
    await expect(staging.readForDisconnect()).resolves.toEqual(state)
    await expect(staging.markChecked()).rejects.toThrow("invalid")
  })
  it.each([
    { remoteUrl: "https://untrusted.example/u-alice/project" },
    { connectedAt: "broken" },
  ])(
    "rejects invalid records during local disconnection: %j",
    async (change) => {
      const production = new SpaceSyncStateStore(
        root,
        "https://sync.eidos.space"
      )
      const state = await production.markClone(
        "https://sync.eidos.space/u-alice/project"
      )
      await fs.writeFile(
        path.join(root, "sync-state.json"),
        JSON.stringify({ ...state, ...change })
      )
      await expect(
        new SpaceSyncStateStore(root, origin).readForDisconnect()
      ).rejects.toThrow("invalid")
    }
  )
  it("persists an explicit custom connection across reopen without treating it as official", async () => {
    const remote = "https://my-sync.example/personal/notes"
    await expect(
      new SpaceSyncStateStore(root, origin).markClone(remote)
    ).rejects.toThrow("verified encryption UUID")
    const state = await new SpaceSyncStateStore(root, origin).markClone(
      remote,
      new Date(),
      "00010203-0405-4607-8809-0a0b0c0d0e0f"
    )
    expect(state).toMatchObject({
      version: 4,
      provider: "custom",
      serverOrigin: "https://my-sync.example",
      remoteUrl: remote,
    })
    expect(await new SpaceSyncStateStore(root, origin).read()).toEqual(state)
    await fs.writeFile(
      path.join(root, "sync-state.json"),
      JSON.stringify({ ...state, serverOrigin: "https://different.example" })
    )
    await expect(new SpaceSyncStateStore(root, origin).read()).rejects.toThrow(
      "invalid"
    )
  })
})
