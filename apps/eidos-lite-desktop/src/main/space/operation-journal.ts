import fs from "node:fs/promises"
import path from "node:path"

export interface SpaceOperationJournalEntry {
  operationId: string
  kind: string
  phase: "quiescing" | "materializing" | "validating" | "reopening"
  startedAt: string
  updatedAt: string
  detail?: string
}

export class SpaceOperationJournal {
  private readonly filePath: string

  constructor(stateDirectory: string) {
    this.filePath = path.join(stateDirectory, "operation.json")
  }

  async read(): Promise<SpaceOperationJournalEntry | null> {
    try {
      const value = JSON.parse(
        await fs.readFile(this.filePath, "utf8")
      ) as unknown
      if (
        typeof value !== "object" ||
        value === null ||
        !("operationId" in value) ||
        typeof value.operationId !== "string" ||
        !("kind" in value) ||
        typeof value.kind !== "string" ||
        !("phase" in value) ||
        !["quiescing", "materializing", "validating", "reopening"].includes(
          String(value.phase)
        )
      ) {
        throw new Error("Invalid Space operation journal")
      }
      return value as SpaceOperationJournalEntry
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw error
    }
  }

  async write(entry: SpaceOperationJournalEntry): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`
    await fs.writeFile(temporaryPath, JSON.stringify(entry), {
      encoding: "utf8",
      mode: 0o600,
    })
    await fs.rename(temporaryPath, this.filePath)
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
}
