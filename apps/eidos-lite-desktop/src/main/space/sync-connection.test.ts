import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { SpaceSyncConnectionStore } from "./sync-connection"

describe("cloud connection identity", () => {
  let directory: string
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "sync-connection-"))
  })
  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true })
  })

  it("persists one random provisioning ID across concurrent retries and restart", async () => {
    const store = new SpaceSyncConnectionStore(directory)
    const ids = await Promise.all(
      Array.from({ length: 10 }, () => store.repository())
    )
    expect(new Set(ids).size).toBe(1)
    expect(await new SpaceSyncConnectionStore(directory).repository()).toBe(
      ids[0]
    )
  })

  it("resumes the same disconnect before allowing a fresh cloud connection", async () => {
    const store = new SpaceSyncConnectionStore(directory)
    const old = await store.repository()
    const intent = await store.beginDisconnect(
      "https://sync.eidos.space/u-test/old"
    )
    expect(intent.repository).not.toBe(old)
    const restored = new SpaceSyncConnectionStore(directory)
    expect(await restored.beginDisconnect(null)).toEqual(intent)
    await expect(restored.repository()).rejects.toThrow("Finish disconnecting")
    await restored.finishDisconnect()
    expect(await restored.repository()).toBe(intent.repository)
    expect((await restored.read())?.previousRemote).toBeNull()
  })

  it("fails closed on corrupt state instead of creating duplicate repositories", async () => {
    await fs.writeFile(path.join(directory, "sync-connection.json"), "{}")
    await expect(
      new SpaceSyncConnectionStore(directory).repository()
    ).rejects.toThrow("invalid")
  })
})
