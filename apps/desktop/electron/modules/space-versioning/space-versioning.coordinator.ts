import { randomUUID } from "crypto"
import fs from "fs/promises"
import path from "path"

import { Injectable, Inject } from "../../common/di"
import { SpaceRegistry } from "../space-management/space-management.module"
import { GraftCliRunner } from "./graft-cli-runner"
import { ensureEidosGraftIgnore } from "./graft-ignore"
import {
  disabledSpaceVersionStatus,
  parseGraftCommit,
  parseGraftCommitResult,
  parseGraftDiff,
  parseGraftLog,
  parseGraftStatus,
} from "./graft-parsers"
import type {
  SpaceVersionCommit,
  SpaceVersionCommitOptions,
  SpaceVersionCommitResult,
  SpaceVersionDiff,
  SpaceVersionDiffOptions,
  SpaceVersionHistoryOptions,
  SpaceVersionHistoryResult,
  SpaceVersionStatus,
} from "./types"

const MUTATION_TIMEOUT_MS = 120_000
const DEFAULT_HISTORY_LIMIT = 100
const MAX_HISTORY_LIMIT = 2_000
const HISTORY_MAX_BUFFER_BYTES = 64 * 1024 * 1024
const MAX_MESSAGE_LENGTH = 4_096
const MAX_REVISION_LENGTH = 512
const REPOSITORY_LOCK_DIRECTORY = ".eidos-operation.lock"
const REPOSITORY_LOCK_OWNER_FILE = "owner.json"
const REPOSITORY_LOCK_RETRY_MS = 75
const REPOSITORY_LOCK_TIMEOUT_MS = MUTATION_TIMEOUT_MS + 15_000
const REPOSITORY_LOCK_STALE_MS = 10 * 60_000

type JsonObject = Record<string, unknown>

interface RepositoryLockOwner {
  pid: number
  token: string
  createdAtMs: number
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function repositoryLockOwner(value: unknown): RepositoryLockOwner | null {
  if (
    !isObject(value) ||
    typeof value.pid !== "number" ||
    !Number.isSafeInteger(value.pid) ||
    value.pid < 1 ||
    typeof value.token !== "string" ||
    !value.token ||
    typeof value.createdAtMs !== "number" ||
    !Number.isSafeInteger(value.createdAtMs) ||
    value.createdAtMs < 0
  ) {
    return null
  }
  return {
    pid: value.pid,
    token: value.token,
    createdAtMs: value.createdAtMs,
  }
}

function processIsAlive(pid: number): boolean {
  if (pid === process.pid) {
    return true
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH"
  }
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function requireSpaceId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("A Space id is required")
  }
  return value
}

function normalizeCommitOptions(value: unknown): SpaceVersionCommitOptions {
  if (!isObject(value) || typeof value.message !== "string") {
    throw new Error("Commit options must include a message")
  }

  const message = value.message.trim()
  if (!message) {
    throw new Error("Commit message cannot be empty")
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new Error(
      `Commit message cannot exceed ${MAX_MESSAGE_LENGTH} characters`
    )
  }
  if (message.includes("\0")) {
    throw new Error("Commit message contains an invalid character")
  }
  return { message }
}

function normalizeRevision(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`)
  }
  const revision = value.trim()
  if (revision.length > MAX_REVISION_LENGTH || revision.includes("\0")) {
    throw new Error(`${label} is invalid`)
  }
  return revision
}

function normalizeHistoryOptions(
  value: unknown
): Required<SpaceVersionHistoryOptions> {
  if (value === undefined) {
    return { limit: DEFAULT_HISTORY_LIMIT, cursor: "" }
  }
  if (!isObject(value)) {
    throw new Error("History options must be an object")
  }

  const rawLimit = value.limit ?? DEFAULT_HISTORY_LIMIT
  if (
    typeof rawLimit !== "number" ||
    !Number.isSafeInteger(rawLimit) ||
    rawLimit < 1 ||
    rawLimit > MAX_HISTORY_LIMIT
  ) {
    throw new Error(`History limit must be between 1 and ${MAX_HISTORY_LIMIT}`)
  }

  const cursor =
    value.cursor === undefined
      ? ""
      : normalizeRevision(value.cursor, "History cursor")
  return { limit: rawLimit, cursor }
}

function normalizeRepositoryPath(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new Error("Diff path is invalid")
  }

  const slashPath = value.trim().split("\\").join("/")
  if (path.posix.isAbsolute(slashPath) || /^[a-zA-Z]:\//.test(slashPath)) {
    throw new Error("Diff path must be relative to the Space")
  }
  const normalized = path.posix.normalize(slashPath)
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error("Diff path must stay inside the Space")
  }
  return normalized
}

function normalizeDiffOptions(value: unknown): SpaceVersionDiffOptions {
  if (!isObject(value)) {
    throw new Error("Diff options must be an object")
  }
  const from = normalizeRevision(value.from, "Diff source revision")
  const to =
    value.to === undefined
      ? undefined
      : normalizeRevision(value.to, "Diff target revision")
  const repositoryPath = normalizeRepositoryPath(value.path)
  return {
    from,
    ...(to === undefined ? {} : { to }),
    ...(repositoryPath === undefined ? {} : { path: repositoryPath }),
  }
}

function filterDiffPath(
  diff: SpaceVersionDiff,
  repositoryPath?: string
): SpaceVersionDiff {
  if (!repositoryPath) {
    return diff
  }
  const descendantPrefix = `${repositoryPath}/`
  return {
    ...diff,
    paths: diff.paths.filter(
      (entry) =>
        entry.path === repositoryPath || entry.path.startsWith(descendantPrefix)
    ),
  }
}

@Injectable()
export class SpaceVersioningCoordinator {
  private readonly operationTails = new Map<string, Promise<void>>()

  constructor(
    @Inject(SpaceRegistry) private readonly registry: SpaceRegistry,
    @Inject(GraftCliRunner) private readonly runner: GraftCliRunner
  ) {}

  async getStatus(spaceIdValue: unknown): Promise<SpaceVersionStatus> {
    const spaceId = requireSpaceId(spaceIdValue)
    return this.withSpaceLock(spaceId, async () => {
      const spacePath = await this.resolveFileSpace(spaceId)
      if (!(await this.hasRepository(spacePath))) {
        return disabledSpaceVersionStatus(spaceId)
      }
      return this.withRepositoryOperationLock(spacePath, () =>
        this.readStatus(spaceId, spacePath)
      )
    })
  }

  async enable(spaceIdValue: unknown): Promise<SpaceVersionStatus> {
    const spaceId = requireSpaceId(spaceIdValue)
    return this.withSpaceLock(spaceId, async () => {
      const spacePath = await this.resolveFileSpace(spaceId)
      await this.ensureRepositoryDirectory(spacePath)
      return this.withRepositoryOperationLock(spacePath, async () => {
        const ignoreUpdate = await ensureEidosGraftIgnore(spacePath)
        try {
          // Graft v0.5 init is idempotent and also repairs an interrupted init
          // that left only part of the .graft directory behind. Keep a partial
          // directory on failure so another waiting Eidos process cannot lose
          // its lock; the next enable attempt will repair it.
          await this.runner.runJson(spacePath, ["init", "--json"])
        } catch (error) {
          try {
            await ignoreUpdate.rollback()
          } catch (rollbackError) {
            throw new Error(
              `${errorMessage(error)} (also failed to restore .graftignore: ${errorMessage(rollbackError)})`
            )
          }
          throw error
        }
        return this.readStatus(spaceId, spacePath)
      })
    })
  }

  async commit(
    spaceIdValue: unknown,
    optionsValue: unknown
  ): Promise<SpaceVersionCommitResult> {
    const spaceId = requireSpaceId(spaceIdValue)
    const options = normalizeCommitOptions(optionsValue)
    return this.withSpaceLock(spaceId, async () => {
      const spacePath = await this.resolveFileSpace(spaceId)
      await this.requireRepository(spacePath)
      return this.withRepositoryOperationLock(spacePath, async () => {
        const before = await this.readStatus(spaceId, spacePath)
        if (before.hasConflicts) {
          throw new Error("Resolve version conflicts before committing")
        }

        try {
          await this.runner.runJson(spacePath, ["add", "--all", "--json"], {
            timeoutMs: MUTATION_TIMEOUT_MS,
          })
          const staged = await this.readStatus(spaceId, spacePath)
          if (staged.hasConflicts) {
            throw new Error("Resolve version conflicts before committing")
          }
          if (!staged.hasStagedChanges) {
            throw new Error("There are no changes to commit")
          }

          const raw = await this.runner.runJson(
            spacePath,
            ["commit", "--json", "-m", options.message],
            { timeoutMs: MUTATION_TIMEOUT_MS }
          )
          return parseGraftCommitResult(raw)
        } catch (error) {
          return this.rollbackAutomaticStaging(
            spaceId,
            spacePath,
            before,
            error
          )
        }
      })
    })
  }

  async getHistory(
    spaceIdValue: unknown,
    optionsValue: unknown = {}
  ): Promise<SpaceVersionHistoryResult> {
    const spaceId = requireSpaceId(spaceIdValue)
    const options = normalizeHistoryOptions(optionsValue)
    return this.withSpaceLock(spaceId, async () => {
      const spacePath = await this.resolveFileSpace(spaceId)
      await this.requireRepository(spacePath)
      return this.withRepositoryOperationLock(spacePath, async () => {
        const history = parseGraftLog(
          await this.runner.runJson(spacePath, ["log", "--json"], {
            maxBufferBytes: HISTORY_MAX_BUFFER_BYTES,
          })
        )

        let start = 0
        if (options.cursor) {
          const cursorIndex = history.commits.findIndex(
            (commit) => commit.id === options.cursor
          )
          if (cursorIndex === -1) {
            throw new Error("History cursor no longer exists")
          }
          start = cursorIndex + 1
        }

        const commits = history.commits.slice(start, start + options.limit)
        const hasMore = start + commits.length < history.commits.length
        return {
          currentHead: history.currentHead,
          currentBranch: history.currentBranch,
          commits,
          nextCursor:
            hasMore && commits.length > 0
              ? commits[commits.length - 1].id
              : null,
          hasMore,
        }
      })
    })
  }

  async getCommit(
    spaceIdValue: unknown,
    commitIdValue: unknown
  ): Promise<SpaceVersionCommit> {
    const spaceId = requireSpaceId(spaceIdValue)
    const commitId = normalizeRevision(commitIdValue, "Commit id")
    return this.withSpaceLock(spaceId, async () => {
      const spacePath = await this.resolveFileSpace(spaceId)
      await this.requireRepository(spacePath)
      return this.withRepositoryOperationLock(spacePath, async () =>
        parseGraftCommit(
          await this.runner.runJson(spacePath, [
            "show",
            "--json",
            "--",
            commitId,
          ])
        )
      )
    })
  }

  async getDiff(
    spaceIdValue: unknown,
    optionsValue: unknown
  ): Promise<SpaceVersionDiff> {
    const spaceId = requireSpaceId(spaceIdValue)
    const options = normalizeDiffOptions(optionsValue)
    return this.withSpaceLock(spaceId, async () => {
      const spacePath = await this.resolveFileSpace(spaceId)
      await this.requireRepository(spacePath)
      return this.withRepositoryOperationLock(spacePath, async () => {
        const args = ["diff", "--json", "--", options.from]
        if (options.to) {
          args.push(options.to)
        }
        const diff = parseGraftDiff(
          await this.runner.runJson(spacePath, args),
          options.from,
          options.to ?? "worktree"
        )
        return filterDiffPath(diff, options.path)
      })
    })
  }

  private async resolveFileSpace(spaceId: string): Promise<string> {
    const space = this.registry.getSpace(spaceId)
    if (!space) {
      throw new Error(`Space not found: ${spaceId}`)
    }
    if (space.mode !== "file") {
      throw new Error("Version history is only available for file Spaces")
    }

    const stats = await fs.stat(space.path).catch(() => {
      throw new Error(`Space folder is unavailable: ${spaceId}`)
    })
    if (!stats.isDirectory()) {
      throw new Error(`Space path is not a directory: ${spaceId}`)
    }
    return fs.realpath(space.path)
  }

  private async hasRepository(spacePath: string): Promise<boolean> {
    try {
      const stats = await fs.lstat(path.join(spacePath, ".graft"))
      if (!stats.isDirectory()) {
        throw new Error("The Space .graft path is not a directory")
      }
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false
      }
      throw error
    }
  }

  private async ensureRepositoryDirectory(spacePath: string): Promise<void> {
    if (await this.hasRepository(spacePath)) {
      return
    }

    try {
      await fs.mkdir(path.join(spacePath, ".graft"))
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error
      }
      if (!(await this.hasRepository(spacePath))) {
        throw new Error("The Space .graft directory became unavailable")
      }
    }
  }

  private async requireRepository(spacePath: string): Promise<void> {
    if (!(await this.hasRepository(spacePath))) {
      throw new Error("Version history is not enabled for this Space")
    }
  }

  private async readStatus(
    spaceId: string,
    spacePath: string
  ): Promise<SpaceVersionStatus> {
    return parseGraftStatus(
      await this.runner.runJson(spacePath, ["status", "--json"]),
      spaceId
    )
  }

  private async rollbackAutomaticStaging(
    spaceId: string,
    spacePath: string,
    before: SpaceVersionStatus,
    originalError: unknown
  ): Promise<never> {
    // If staged content existed before Eidos started, restoring all would erase
    // user-owned index state. In that case preserve it for a retry.
    if (before.hasStagedChanges) {
      throw originalError
    }

    try {
      const current = await this.readStatus(spaceId, spacePath)
      if (current.hasStagedChanges && !current.hasConflicts) {
        await this.runner.runJson(
          spacePath,
          ["restore", "--staged", "--all", "--json"],
          { timeoutMs: MUTATION_TIMEOUT_MS }
        )
      }
    } catch (rollbackError) {
      throw new Error(
        `${errorMessage(originalError)} (also failed to restore automatically staged changes: ${errorMessage(rollbackError)})`
      )
    }
    throw originalError
  }

  private async withRepositoryOperationLock<T>(
    spacePath: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const graftPath = path.join(spacePath, ".graft")
    const lockPath = path.join(graftPath, REPOSITORY_LOCK_DIRECTORY)
    const token = randomUUID()
    const owner: RepositoryLockOwner = {
      pid: process.pid,
      token,
      createdAtMs: Date.now(),
    }
    const startedAt = Date.now()

    while (true) {
      try {
        await fs.mkdir(lockPath, { mode: 0o700 })
        try {
          await fs.writeFile(
            path.join(lockPath, REPOSITORY_LOCK_OWNER_FILE),
            JSON.stringify(owner),
            { encoding: "utf8", mode: 0o600 }
          )
        } catch (error) {
          await fs.rm(lockPath, { recursive: true, force: true })
          throw error
        }
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error
        }
        if (await this.breakStaleRepositoryLock(lockPath)) {
          continue
        }
        if (Date.now() - startedAt >= REPOSITORY_LOCK_TIMEOUT_MS) {
          throw new Error(
            "Version history is busy in another Eidos process; try again shortly"
          )
        }
        await wait(REPOSITORY_LOCK_RETRY_MS)
      }
    }

    try {
      return await operation()
    } finally {
      await this.releaseRepositoryLock(lockPath, token)
    }
  }

  private async breakStaleRepositoryLock(lockPath: string): Promise<boolean> {
    let stale = false
    try {
      const stats = await fs.stat(lockPath)
      const rawOwner = await fs
        .readFile(path.join(lockPath, REPOSITORY_LOCK_OWNER_FILE), "utf8")
        .then((content) => repositoryLockOwner(JSON.parse(content)))
        .catch(() => null)
      stale = rawOwner
        ? !processIsAlive(rawOwner.pid) ||
          Date.now() - rawOwner.createdAtMs > REPOSITORY_LOCK_STALE_MS
        : Date.now() - stats.mtimeMs > REPOSITORY_LOCK_STALE_MS
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT"
    }

    if (!stale) {
      return false
    }

    const quarantinePath = `${lockPath}.stale-${randomUUID()}`
    try {
      await fs.rename(lockPath, quarantinePath)
      await fs.rm(quarantinePath, { recursive: true, force: true })
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return true
      }
      throw error
    }
  }

  private async releaseRepositoryLock(
    lockPath: string,
    token: string
  ): Promise<void> {
    const ownsLock = await fs
      .readFile(path.join(lockPath, REPOSITORY_LOCK_OWNER_FILE), "utf8")
      .then(
        (content) => repositoryLockOwner(JSON.parse(content))?.token === token
      )
      .catch(() => false)
    if (!ownsLock) {
      return
    }

    const releasedPath = `${lockPath}.released-${token}`
    try {
      await fs.rename(lockPath, releasedPath)
      await fs.rm(releasedPath, { recursive: true, force: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error
      }
    }
  }

  private async withSpaceLock<T>(
    spaceId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const previous = this.operationTails.get(spaceId) ?? Promise.resolve()
    const result = previous.catch(() => undefined).then(operation)
    const tail = result.then(
      () => undefined,
      () => undefined
    )
    this.operationTails.set(spaceId, tail)

    try {
      return await result
    } finally {
      if (this.operationTails.get(spaceId) === tail) {
        this.operationTails.delete(spaceId)
      }
    }
  }
}
