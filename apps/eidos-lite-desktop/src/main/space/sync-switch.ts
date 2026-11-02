import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"

interface SwitchIntent {
  previous: string
  encryptionUuid: string
  target: string
}

/** Durable rollback intent. Contains no passwords or bearer tokens. */
export class SyncSwitchJournal {
  private file: string
  constructor(private directory: string) {
    this.file = path.join(directory, "sync-switch.json")
  }
  async begin(intent: SwitchIntent): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 })
    const temporary = `${this.file}.${randomUUID()}.tmp`
    const handle = await fs.open(temporary, "wx", 0o600)
    try {
      await handle.writeFile(JSON.stringify(intent))
      await handle.sync()
    } finally {
      await handle.close()
    }
    await fs.rename(temporary, this.file)
    if (process.platform !== "win32") {
      const directory = await fs.open(this.directory, "r")
      try {
        await directory.sync()
      } finally {
        await directory.close()
      }
    }
  }
  async recover(
    readCommittedRemote: string | null | (() => Promise<string | null>),
    restore: (intent: SwitchIntent) => Promise<void>
  ): Promise<void> {
    let raw: string
    try {
      raw = await fs.readFile(this.file, "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return
      throw error
    }
    const intent = JSON.parse(raw) as SwitchIntent
    if (
      !intent ||
      typeof intent.previous !== "string" ||
      typeof intent.target !== "string" ||
      !/^[0-9a-f-]{36}$/.test(intent.encryptionUuid)
    )
      throw new Error("Invalid Sync switch recovery state")
    const committedRemote =
      typeof readCommittedRemote === "function"
        ? await readCommittedRemote()
        : readCommittedRemote
    if (committedRemote !== intent.target) {
      if (committedRemote !== intent.previous)
        throw new Error("Sync connection changed during switch recovery")
      await restore(intent)
    }
    await fs.rm(this.file, { force: true })
  }
}
