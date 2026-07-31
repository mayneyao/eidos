import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"

import type { OAuthUser } from "./oauth-client"

export interface StoredAccountProfile extends OAuthUser {
  verifiedAtMs: number
}

function validOptionalString(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && value.length > 0)
}

function validProfile(value: unknown): value is StoredAccountProfile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const profile = value as Record<string, unknown>
  return (
    typeof profile.id === "string" &&
    profile.id.length > 0 &&
    Number.isSafeInteger(profile.verifiedAtMs) &&
    Number(profile.verifiedAtMs) >= 0 &&
    validOptionalString(profile.email) &&
    validOptionalString(profile.name) &&
    validOptionalString(profile.avatarUrl) &&
    (profile.avatarDataUrl === undefined ||
      (typeof profile.avatarDataUrl === "string" &&
        /^data:image\/(?:gif|jpeg|png|webp);base64,/.test(
          profile.avatarDataUrl
        )))
  )
}

/**
 * Stores only the small, non-secret account summary needed to paint Sync
 * immediately. OAuth tokens remain exclusively in SecureAccountCredentialStore.
 */
export class AccountProfileStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<StoredAccountProfile | null> {
    try {
      const value = JSON.parse(await fs.readFile(this.filePath, "utf8"))
      return validProfile(value) ? value : null
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      return null
    }
  }

  async write(user: OAuthUser): Promise<StoredAccountProfile> {
    const profile: StoredAccountProfile = {
      id: user.id,
      ...(user.email ? { email: user.email } : {}),
      ...(user.name ? { name: user.name } : {}),
      ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
      ...(user.avatarDataUrl ? { avatarDataUrl: user.avatarDataUrl } : {}),
      verifiedAtMs: Date.now(),
    }
    const directory = path.dirname(this.filePath)
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`
    await fs.mkdir(directory, { recursive: true, mode: 0o700 })
    try {
      await fs.writeFile(temporaryPath, JSON.stringify(profile), {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      })
      await fs.rename(temporaryPath, this.filePath)
      await fs.chmod(this.filePath, 0o600)
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => undefined)
      throw error
    }
    return profile
  }

  async clear(): Promise<void> {
    await fs.unlink(this.filePath).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    })
  }
}
