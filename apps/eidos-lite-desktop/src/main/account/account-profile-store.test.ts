import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { AccountProfileStore } from "./account-profile-store"

describe("AccountProfileStore", () => {
  it("keeps a non-secret display summary separate from OAuth credentials", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-account-profile-")
    )
    const filePath = path.join(root, "production", "profile.json")
    try {
      const store = new AccountProfileStore(filePath)
      await store.write({
        id: "user-1",
        email: "person@example.com",
        name: "Eidos User",
        avatarUrl: "https://eidos.space/avatar/user-1.png",
        avatarDataUrl: "data:image/png;base64,iVBORw==",
      })

      const raw = await fs.readFile(filePath, "utf8")
      expect(raw).toContain("person@example.com")
      expect(raw).not.toContain("accessToken")
      expect(raw).not.toContain("refreshToken")
      expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600)
      await expect(store.read()).resolves.toMatchObject({
        id: "user-1",
        email: "person@example.com",
        avatarUrl: "https://eidos.space/avatar/user-1.png",
        avatarDataUrl: "data:image/png;base64,iVBORw==",
      })

      await store.clear()
      await expect(store.read()).resolves.toBeNull()
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
