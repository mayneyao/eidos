import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export interface StableDeviceIdentity {
  version: 1
  stableDeviceId: string
}

function validIdentity(value: unknown): value is StableDeviceIdentity {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    record.version === 1 &&
    typeof record.stableDeviceId === "string" &&
    UUID_V4.test(record.stableDeviceId)
  )
}

export class DeviceIdentityStore {
  constructor(
    private readonly filePath: string,
    private readonly createId: () => string = randomUUID
  ) {}

  async getOrCreate(): Promise<StableDeviceIdentity> {
    const existing = await this.read()
    if (existing) return existing

    const identity: StableDeviceIdentity = {
      version: 1,
      stableDeviceId: this.createId().toLowerCase(),
    }
    if (!validIdentity(identity)) {
      throw new Error("Eidos Lite could not create a stable device identity.")
    }
    const directory = path.dirname(this.filePath)
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`
    await fs.mkdir(directory, { recursive: true, mode: 0o700 })
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(identity)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      })
      await fs.rename(temporaryPath, this.filePath)
      await fs.chmod(this.filePath, 0o600)
      return identity
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => undefined)
      const raced = await this.read()
      if (raced) return raced
      throw error
    }
  }

  private async read(): Promise<StableDeviceIdentity | null> {
    let raw: string
    try {
      raw = await fs.readFile(this.filePath, "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw new Error("Eidos Lite could not read its device identity.")
    }
    try {
      const value = JSON.parse(raw) as unknown
      if (!validIdentity(value)) throw new Error("invalid device identity")
      return value
    } catch {
      throw new Error(
        "The Eidos Lite device identity is invalid and must be repaired before Sync can continue."
      )
    }
  }
}
