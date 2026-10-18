import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

interface SyncConnectionIntent {
  version: 1
  repository: string
  disconnecting: boolean
  provisioning?: boolean
  previousRemote: string | null
}

/** Cloud connection identity is independent of the folder and its local history. */
export class SpaceSyncConnectionStore {
  private readonly file: string
  private tail: Promise<unknown> = Promise.resolve()

  constructor(private readonly directory: string) {
    this.file = path.join(directory, "sync-connection.json")
  }

  async read(): Promise<SyncConnectionIntent | null> {
    let raw: string
    try {
      raw = await fs.readFile(this.file, "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw error
    }
    const value = JSON.parse(raw) as Partial<SyncConnectionIntent>
    if (
      value.version !== 1 ||
      typeof value.repository !== "string" ||
      !/^[a-zA-Z0-9_-]{8,64}$/.test(value.repository) ||
      typeof value.disconnecting !== "boolean" ||
      (value.provisioning !== undefined &&
        typeof value.provisioning !== "boolean") ||
      (value.previousRemote !== null &&
        typeof value.previousRemote !== "string")
    )
      throw new Error("The Space cloud connection state is invalid")
    return value as SyncConnectionIntent
  }

  repository(): Promise<string> {
    return this.serialize(async () => {
      const current = await this.read()
      if (current?.disconnecting)
        throw new Error(
          "Finish disconnecting this Space before connecting again"
        )
      if (current) {
        if (!current.provisioning)
          await this.write({ ...current, provisioning: true })
        return current.repository
      }
      const intent: SyncConnectionIntent = {
        version: 1,
        repository: randomUUID(),
        disconnecting: false,
        provisioning: true,
        previousRemote: null,
      }
      await this.write(intent)
      return intent.repository
    })
  }

  beginDisconnect(
    previousRemote: string | null
  ): Promise<SyncConnectionIntent> {
    return this.serialize(async () => {
      const current = await this.read()
      if (current?.disconnecting) return current
      const intent: SyncConnectionIntent = {
        version: 1,
        repository: randomUUID(),
        disconnecting: true,
        provisioning: false,
        previousRemote,
      }
      await this.write(intent)
      return intent
    })
  }

  finishDisconnect(): Promise<void> {
    return this.serialize(async () => {
      const current = await this.read()
      if (current?.disconnecting)
        await this.write({
          ...current,
          disconnecting: false,
          previousRemote: null,
        })
    })
  }

  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const task = this.tail.then(action, action)
    this.tail = task.catch(() => undefined)
    return task
  }

  private async write(value: SyncConnectionIntent): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 })
    const temporary = `${this.file}.${randomUUID()}.tmp`
    try {
      const handle = await fs.open(temporary, "wx", 0o600)
      try {
        await handle.writeFile(JSON.stringify(value) + "\n")
        await handle.sync()
      } finally {
        await handle.close()
      }
      await fs.rename(temporary, this.file)
      if (process.platform === "win32") return
      const directory = await fs.open(this.directory, "r")
      try {
        await directory.sync()
      } finally {
        await directory.close()
      }
    } finally {
      await fs.rm(temporary, { force: true })
    }
  }
}
