import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import { isOfficialRemoteUrl } from "../graft/graft-client"
import { canonicalizeSpaceRoot } from "../space/space-paths"
import { SpaceSyncStateStore } from "../space/sync-state"

interface CloneGraftClient {
  clone(
    targetDirectory: string,
    remoteUrl: string,
    token?: string
  ): Promise<unknown>
  close(): Promise<void>
}

type CloneOperationKind = "remote-clone" | "local-recovery"
type CloneOperationPhase =
  | "preparing"
  | "cloning"
  | "copying"
  | "validating"
  | "publishing"
  | "published"

interface CloneJournalEntry {
  version: 2
  kind: CloneOperationKind
  operationId: string
  phase: CloneOperationPhase
  targetPath: string
  stagingPath: string
  remoteUrl?: string
  sourcePath?: string
  startedAt: string
  updatedAt: string
}

export interface CloneRecoveryResult {
  completed: string[]
  cleaned: string[]
  warnings: string[]
}

interface SpaceCloneCoordinatorOptions {
  stateDirectory: string
  remoteOrigin: string
  createGraftClient(): CloneGraftClient
  validateWorktree(root: string): Promise<void>
}

export class SpaceCloneCoordinator {
  private readonly journalDirectory: string
  private operationTail: Promise<void> = Promise.resolve()

  constructor(private readonly options: SpaceCloneCoordinatorOptions) {
    this.journalDirectory = path.join(
      options.stateDirectory,
      "clone-operations"
    )
  }

  clone(
    targetPath: string,
    remoteUrl: string,
    accessToken: string
  ): Promise<string> {
    const scheduled = this.operationTail.then(() =>
      this.cloneExclusive(targetPath, remoteUrl, accessToken)
    )
    this.operationTail = scheduled.then(
      () => undefined,
      () => undefined
    )
    return scheduled
  }

  copyLocalRecovery(sourcePath: string, targetPath: string): Promise<string> {
    const scheduled = this.operationTail.then(() =>
      this.copyLocalRecoveryExclusive(sourcePath, targetPath)
    )
    this.operationTail = scheduled.then(
      () => undefined,
      () => undefined
    )
    return scheduled
  }

  async recoverInterrupted(): Promise<CloneRecoveryResult> {
    const result: CloneRecoveryResult = {
      completed: [],
      cleaned: [],
      warnings: [],
    }
    let files: string[]
    try {
      files = await fs.readdir(this.journalDirectory)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return result
      throw error
    }
    for (const name of files.filter((entry) => entry.endsWith(".json"))) {
      const journalPath = path.join(this.journalDirectory, name)
      try {
        const entry = await this.readJournal(journalPath)
        const [targetExists, stagingExists] = await Promise.all([
          this.pathExists(entry.targetPath),
          this.pathExists(entry.stagingPath),
        ])
        if (targetExists && stagingExists) {
          throw new Error(
            "both the final and temporary clone folders exist; no files were removed"
          )
        }
        if (entry.phase === "published" || targetExists) {
          if (!targetExists) {
            throw new Error("the published clone folder is missing")
          }
          await this.finishPublishedClone(entry)
          await fs.unlink(journalPath)
          result.completed.push(entry.targetPath)
          continue
        }
        if (stagingExists) {
          await this.removeOwnedStaging(entry)
          result.cleaned.push(entry.stagingPath)
        }
        await fs.unlink(journalPath)
      } catch (error) {
        result.warnings.push(
          `${name}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
    return result
  }

  private async cloneExclusive(
    requestedTarget: string,
    remoteUrl: string,
    accessToken: string
  ): Promise<string> {
    if (!accessToken) throw new Error("An Eidos Sync access token is required")
    if (!isOfficialRemoteUrl(remoteUrl, this.options.remoteOrigin)) {
      throw new Error("Eidos Lite accepts only the official Eidos Sync Remote")
    }
    const targetPath = await this.validateTarget(requestedTarget)

    const operationId = randomUUID()
    const parent = path.dirname(targetPath)
    const stagingPath = path.join(
      parent,
      `.${path.basename(targetPath)}.eidos-lite-clone-${operationId}`
    )
    const now = new Date().toISOString()
    let entry: CloneJournalEntry = {
      version: 2,
      kind: "remote-clone",
      operationId,
      phase: "preparing",
      targetPath,
      stagingPath,
      remoteUrl,
      startedAt: now,
      updatedAt: now,
    }
    const journalPath = this.journalPath(operationId)
    await this.writeJournal(journalPath, entry)
    const client = this.options.createGraftClient()
    try {
      await fs.mkdir(stagingPath, { mode: 0o700 })
      entry = await this.advance(journalPath, entry, "cloning")
      await client.clone(stagingPath, remoteUrl, accessToken)
      entry = await this.advance(journalPath, entry, "validating")
      await this.options.validateWorktree(stagingPath)
      entry = await this.advance(journalPath, entry, "publishing")
      await fs.rename(stagingPath, targetPath)
      entry = await this.advance(journalPath, entry, "published")
      await this.finishPublishedClone(entry)
      await fs.unlink(journalPath)
      return targetPath
    } catch (error) {
      if (!(await this.pathExists(targetPath))) {
        try {
          if (await this.pathExists(stagingPath)) {
            await this.removeOwnedStaging(entry)
          }
          await fs.unlink(journalPath)
        } catch {
          // Keep the owner-only journal when cleanup cannot complete. Startup
          // recovery will retry only the exact temporary sibling it records.
        }
      }
      throw error
    } finally {
      await client.close().catch(() => undefined)
    }
  }

  private async copyLocalRecoveryExclusive(
    requestedSource: string,
    requestedTarget: string
  ): Promise<string> {
    const sourcePath = await fs.realpath(path.resolve(requestedSource))
    if (!(await fs.stat(sourcePath)).isDirectory()) {
      throw new Error("The Local Recovery source must be a folder")
    }
    const targetPath = await this.validateTarget(requestedTarget, sourcePath)
    const operationId = randomUUID()
    const stagingPath = path.join(
      path.dirname(targetPath),
      `.${path.basename(targetPath)}.eidos-lite-clone-${operationId}`
    )
    const now = new Date().toISOString()
    let entry: CloneJournalEntry = {
      version: 2,
      kind: "local-recovery",
      operationId,
      phase: "preparing",
      targetPath,
      stagingPath,
      sourcePath,
      startedAt: now,
      updatedAt: now,
    }
    const journalPath = this.journalPath(operationId)
    await this.writeJournal(journalPath, entry)
    try {
      await fs.mkdir(stagingPath, { mode: 0o700 })
      entry = await this.advance(journalPath, entry, "copying")
      await this.copyPortableSpace(sourcePath, stagingPath)
      entry = await this.advance(journalPath, entry, "validating")
      await this.options.validateWorktree(stagingPath)
      entry = await this.advance(journalPath, entry, "publishing")
      await fs.rename(stagingPath, targetPath)
      entry = await this.advance(journalPath, entry, "published")
      await this.finishPublishedClone(entry)
      await fs.unlink(journalPath)
      return targetPath
    } catch (error) {
      if (!(await this.pathExists(targetPath))) {
        try {
          if (await this.pathExists(stagingPath)) {
            await this.removeOwnedStaging(entry)
          }
          await fs.unlink(journalPath)
        } catch {
          // Startup recovery owns the exact remaining temporary sibling.
        }
      }
      throw error
    }
  }

  private async finishPublishedClone(entry: CloneJournalEntry): Promise<void> {
    await this.options.validateWorktree(entry.targetPath)
    if (entry.kind === "local-recovery") return
    if (!entry.remoteUrl) throw new Error("Remote clone journal has no Remote")
    const canonical = await canonicalizeSpaceRoot(entry.targetPath)
    await new SpaceSyncStateStore(
      path.join(this.options.stateDirectory, "spaces", canonical.id),
      this.options.remoteOrigin
    ).markClone(entry.remoteUrl)
  }

  private async removeOwnedStaging(entry: CloneJournalEntry): Promise<void> {
    const expected = path.join(
      path.dirname(entry.targetPath),
      `.${path.basename(entry.targetPath)}.eidos-lite-clone-${entry.operationId}`
    )
    if (entry.stagingPath !== expected) {
      throw new Error("refusing to remove an unexpected clone staging path")
    }
    await fs.rm(entry.stagingPath, { recursive: true, force: true })
  }

  private async advance(
    journalPath: string,
    entry: CloneJournalEntry,
    phase: CloneOperationPhase
  ): Promise<CloneJournalEntry> {
    const next = {
      ...entry,
      phase,
      updatedAt: new Date().toISOString(),
    }
    await this.writeJournal(journalPath, next)
    return next
  }

  private async writeJournal(
    journalPath: string,
    entry: CloneJournalEntry
  ): Promise<void> {
    await fs.mkdir(this.journalDirectory, { recursive: true, mode: 0o700 })
    const temporaryPath = `${journalPath}.${process.pid}.tmp`
    await fs.writeFile(temporaryPath, `${JSON.stringify(entry)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    })
    await fs.rename(temporaryPath, journalPath)
    await fs.chmod(journalPath, 0o600)
  }

  private async readJournal(journalPath: string): Promise<CloneJournalEntry> {
    const value = JSON.parse(await fs.readFile(journalPath, "utf8")) as Record<
      string,
      unknown
    >
    const legacy = value.version === 1
    const kind = legacy ? "remote-clone" : value.kind
    if (
      (!legacy && value.version !== 2) ||
      !["remote-clone", "local-recovery"].includes(String(kind)) ||
      typeof value.operationId !== "string" ||
      ![
        "preparing",
        "cloning",
        "copying",
        "validating",
        "publishing",
        "published",
      ].includes(String(value.phase)) ||
      typeof value.targetPath !== "string" ||
      !path.isAbsolute(value.targetPath) ||
      typeof value.stagingPath !== "string" ||
      !path.isAbsolute(value.stagingPath) ||
      typeof value.startedAt !== "string" ||
      typeof value.updatedAt !== "string"
    ) {
      throw new Error("invalid clone recovery journal")
    }
    if (
      kind === "remote-clone" &&
      (typeof value.remoteUrl !== "string" ||
        !isOfficialRemoteUrl(value.remoteUrl, this.options.remoteOrigin))
    ) {
      throw new Error("invalid clone recovery journal")
    }
    if (
      kind === "local-recovery" &&
      (typeof value.sourcePath !== "string" ||
        !path.isAbsolute(value.sourcePath))
    ) {
      throw new Error("invalid clone recovery journal")
    }
    return {
      version: 2,
      kind: kind as CloneOperationKind,
      operationId: value.operationId,
      phase: value.phase as CloneOperationPhase,
      targetPath: value.targetPath,
      stagingPath: value.stagingPath,
      ...(typeof value.remoteUrl === "string"
        ? { remoteUrl: value.remoteUrl }
        : {}),
      ...(typeof value.sourcePath === "string"
        ? { sourcePath: value.sourcePath }
        : {}),
      startedAt: value.startedAt,
      updatedAt: value.updatedAt,
    }
  }

  private async validateTarget(
    requestedTarget: string,
    sourcePath?: string
  ): Promise<string> {
    const targetPath = path.resolve(requestedTarget)
    const parent = path.dirname(targetPath)
    const canonicalParent = await fs.realpath(parent)
    if ((await fs.lstat(parent)).isSymbolicLink()) {
      throw new Error("The destination parent cannot be a symlink")
    }
    if (!(await fs.stat(canonicalParent)).isDirectory()) {
      throw new Error("The destination parent must be a folder")
    }
    if (await this.pathExists(targetPath)) {
      throw new Error(
        "The destination already exists. Choose a new folder name."
      )
    }
    if (
      sourcePath &&
      (targetPath === sourcePath ||
        targetPath.startsWith(`${sourcePath}${path.sep}`))
    ) {
      throw new Error(
        "A Recovery Space must be created outside the source Space"
      )
    }
    return targetPath
  }

  private async copyPortableSpace(
    sourceRoot: string,
    targetRoot: string
  ): Promise<void> {
    const copyDirectory = async (
      sourceDirectory: string,
      targetDirectory: string,
      relativeDirectory: string
    ): Promise<void> => {
      const children = (await fs.readdir(sourceDirectory)).sort()
      for (const child of children) {
        const relativePath = relativeDirectory
          ? path.join(relativeDirectory, child)
          : child
        if (relativePath.toLowerCase() === ".graft") continue
        if (child.toLowerCase() === ".graft") {
          throw new Error("Nested .graft directories cannot be recovered")
        }
        const sourcePath = path.join(sourceDirectory, child)
        const targetPath = path.join(targetDirectory, child)
        const stats = await fs.lstat(sourcePath)
        if (stats.isSymbolicLink()) {
          throw new Error("Space symlinks cannot be copied into Recovery")
        }
        if (stats.isDirectory()) {
          await fs.mkdir(targetPath, { mode: stats.mode & 0o777 })
          await copyDirectory(sourcePath, targetPath, relativePath)
          continue
        }
        if (!stats.isFile()) {
          throw new Error(
            "Only ordinary files and folders can be copied into Recovery"
          )
        }
        await fs.copyFile(sourcePath, targetPath)
        await fs.chmod(targetPath, stats.mode & 0o777)
      }
    }
    await copyDirectory(sourceRoot, targetRoot, "")
  }

  private journalPath(operationId: string): string {
    return path.join(this.journalDirectory, `${operationId}.json`)
  }

  private async pathExists(target: string): Promise<boolean> {
    return fs
      .lstat(target)
      .then(() => true)
      .catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
        throw error
      })
  }
}
