import fs from "node:fs/promises"
import path from "node:path"

export interface SharedPeerSpace {
  id: string
  root: string
}

interface PeerPreferences {
  enabled: boolean
  spaces: SharedPeerSpace[]
}

/** Device-local intent, independent of sockets and application shutdown. */
export class PeerPreferencesStore {
  private readonly file: string
  constructor(userData: string) {
    this.file = path.join(userData, "peer-sync", "preferences.json")
  }

  async read(): Promise<PeerPreferences> {
    let value: unknown
    try {
      value = JSON.parse(await fs.readFile(this.file, "utf8"))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { enabled: false, spaces: [] }
      throw error
    }
    if (!value || typeof value !== "object")
      throw new Error("Invalid LAN sync preferences")
    const record = value as Record<string, unknown>
    if (typeof record.enabled !== "boolean" || !Array.isArray(record.spaces))
      throw new Error("Invalid LAN sync preferences")
    const spaces = record.spaces.map((space: unknown) => {
      if (!space || typeof space !== "object")
        throw new Error("Invalid shared Space")
      const item = space as Record<string, unknown>
      if (
        typeof item.id !== "string" ||
        typeof item.root !== "string" ||
        !path.isAbsolute(item.root)
      )
        throw new Error("Invalid shared Space")
      return { id: item.id, root: item.root }
    })
    return { enabled: record.enabled, spaces }
  }

  async write(value: PeerPreferences): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 })
    const temporary = this.file + ".tmp"
    await fs.writeFile(temporary, JSON.stringify(value), { mode: 0o600 })
    await fs.rename(temporary, this.file)
  }

  async restore(
    start: () => Promise<unknown>,
    share: (space: SharedPeerSpace) => Promise<unknown>,
    failed: (error: unknown) => void
  ): Promise<void> {
    const value = await this.read()
    if (!value.enabled) return
    await start()
    for (const space of value.spaces) {
      try {
        await share(space)
      } catch (error) {
        failed(error)
      }
    }
  }
}
