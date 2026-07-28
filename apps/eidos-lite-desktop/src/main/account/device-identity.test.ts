import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { DeviceIdentityStore } from "./device-identity"

const stableDeviceId = "0f9a8b7c-6d5e-4f32-a109-876543210abc"

describe("DeviceIdentityStore", () => {
  let root = ""
  let filePath = ""

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-device-"))
    filePath = path.join(root, "identity", "device.json")
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it("creates one owner-only UUID and reuses it across sessions", async () => {
    const store = new DeviceIdentityStore(filePath, () => stableDeviceId)
    await expect(store.getOrCreate()).resolves.toEqual({
      version: 1,
      stableDeviceId,
    })
    await expect(
      new DeviceIdentityStore(filePath, () => crypto.randomUUID()).getOrCreate()
    ).resolves.toEqual({ version: 1, stableDeviceId })
    expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600)
  })

  it("fails closed when the durable identity is corrupt", async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, '{"version":1,"stableDeviceId":"wrong"}')
    await expect(
      new DeviceIdentityStore(filePath).getOrCreate()
    ).rejects.toThrow("must be repaired")
  })
})
