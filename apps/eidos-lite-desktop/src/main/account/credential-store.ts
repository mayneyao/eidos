import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"

import type { RegisteredSyncDevice } from "./account-sync-client"
import type { OAuthTokens, OAuthUser } from "./oauth-client"

export interface StoredAccountSession {
  tokens: OAuthTokens
  user: OAuthUser
  device: RegisteredSyncDevice
}

export interface SecretEncryption {
  isAvailable(): boolean
  encrypt(value: string): Buffer
  decrypt(value: Buffer): string
}

function validSession(value: unknown): value is StoredAccountSession {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const session = value as Record<string, unknown>
  const tokens = session.tokens as Record<string, unknown> | undefined
  const user = session.user as Record<string, unknown> | undefined
  const device = session.device as Record<string, unknown> | undefined
  return (
    typeof tokens?.accessToken === "string" &&
    typeof tokens.tokenType === "string" &&
    typeof tokens.storedAtMs === "number" &&
    typeof user?.id === "string" &&
    typeof device?.id === "string" &&
    typeof device.displayName === "string" &&
    ["macos", "windows", "linux", "unknown"].includes(
      String(device.platform)
    ) &&
    device.status === "active" &&
    Number.isSafeInteger(device.version)
  )
}

export class SecureAccountCredentialStore {
  constructor(
    private readonly filePath: string,
    private readonly encryption: SecretEncryption
  ) {}

  async read(): Promise<StoredAccountSession | null> {
    let encrypted: Buffer
    try {
      encrypted = await fs.readFile(this.filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw new Error("Eidos Lite could not read the secure account session.")
    }
    if (!this.encryption.isAvailable()) {
      throw new Error(
        "System credential encryption is unavailable. Eidos Sync remains signed out."
      )
    }
    try {
      const value = JSON.parse(this.encryption.decrypt(encrypted)) as unknown
      if (!validSession(value)) throw new Error("invalid session")
      return value
    } catch {
      throw new Error(
        "The secure Eidos account session is invalid. Sign in again."
      )
    }
  }

  async write(session: StoredAccountSession): Promise<void> {
    if (!this.encryption.isAvailable()) {
      throw new Error(
        "System credential encryption is unavailable. Eidos Lite will not store account tokens as plaintext."
      )
    }
    const directory = path.dirname(this.filePath)
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`
    await fs.mkdir(directory, { recursive: true, mode: 0o700 })
    const payload = this.encryption.encrypt(JSON.stringify(session))
    try {
      await fs.writeFile(temporaryPath, payload, { mode: 0o600, flag: "wx" })
      await fs.rename(temporaryPath, this.filePath)
      await fs.chmod(this.filePath, 0o600)
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }

  async clear(): Promise<void> {
    await fs.unlink(this.filePath).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    })
  }
}
