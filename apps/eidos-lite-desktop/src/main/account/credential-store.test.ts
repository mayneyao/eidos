import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  SecureAccountCredentialStore,
  type SecretEncryption,
  type StoredAccountSession,
} from "./credential-store"

const session: StoredAccountSession = {
  tokens: {
    accessToken: "access-secret",
    refreshToken: "refresh-secret",
    tokenType: "Bearer",
    expiresIn: 3600,
    storedAtMs: 1,
  },
  user: { id: "user-1", email: "user@example.test" },
  device: {
    id: "device-1",
    displayName: "Eidos Lite on macOS",
    platform: "macos",
    appVersion: "0.1.0",
    status: "active",
    version: 1,
  },
}

describe("SecureAccountCredentialStore", () => {
  let root = ""
  let filePath = ""

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-account-"))
    filePath = path.join(root, "staging", "session.bin")
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it("stores only encrypted bytes with owner-only permissions", async () => {
    const encryption: SecretEncryption = {
      isAvailable: () => true,
      encrypt: (value) => Buffer.from(value).reverse(),
      decrypt: (value) => value.reverse().toString("utf8"),
    }
    const store = new SecureAccountCredentialStore(filePath, encryption)
    await store.write(session)
    const raw = await fs.readFile(filePath, "utf8")
    expect(raw).not.toContain("access-secret")
    expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600)
    await expect(store.read()).resolves.toEqual(session)
    await store.clear()
    await expect(store.read()).resolves.toBeNull()
  })

  it("fails closed instead of storing plaintext", async () => {
    const store = new SecureAccountCredentialStore(filePath, {
      isAvailable: () => false,
      encrypt: () => Buffer.alloc(0),
      decrypt: () => "",
    })
    await expect(store.write(session)).rejects.toThrow("will not store")
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: "ENOENT" })
  })
})
