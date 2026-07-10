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
  parseGraftRestorePaths,
  parseGraftRestoreSource,
  parseGraftRestoreVersionSource,
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
  SpaceVersionRestoreOptions,
  SpaceVersionRestoreResult,
  SpaceVersionRestoreEffect,
  SpaceVersionRestorePathOptions,
  SpaceVersionRestorePathResult,
  SpaceVersionPathStatus,
  SpaceVersionStatus,
} from "./types"

const MUTATION_TIMEOUT_MS = 120_000
const DEFAULT_HISTORY_LIMIT = 100
const MAX_HISTORY_LIMIT = 2_000
const HISTORY_MAX_BUFFER_BYTES = 64 * 1024 * 1024
const TEXT_DIFF_MAX_CONTENT_BYTES = 1024 * 1024
const TEXT_DIFF_MAX_BUFFER_BYTES = 3 * TEXT_DIFF_MAX_CONTENT_BYTES + 1024 * 1024
const MAX_MESSAGE_LENGTH = 4_096
const MAX_REVISION_LENGTH = 512
const REPOSITORY_LOCK_DIRECTORY = ".eidos-operation.lock"
const REPOSITORY_LOCK_OWNER_FILE = "owner.json"
const REPOSITORY_LOCK_RETRY_MS = 75
const REPOSITORY_LOCK_TIMEOUT_MS = MUTATION_TIMEOUT_MS + 15_000
const REPOSITORY_LOCK_STALE_MS = 10 * 60_000
// Graft currently models a whole-Space worktree restore as a root pathspec.
// Keep this isolated so Eidos can switch to a future first-class --all form.
const RESTORE_VERSION_PATHSPEC = "."

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

function restoreReconciliationError(error: unknown): Error {
  return new Error(
    `Space files may have been restored, but Eidos could not verify the final version state: ${errorMessage(error)}. Refresh the Space before continuing.`
  )
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

function normalizeRepositoryPath(
  value: unknown,
  label = "Diff path"
): string | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new Error(`${label} is invalid`)
  }

  // Graft uses slash-separated paths on Windows, while a backslash is a legal
  // filename character on POSIX. Preserve that identity outside Windows.
  const slashPath =
    process.platform === "win32" ? value.replace(/\\/g, "/") : value
  if (
    path.posix.isAbsolute(slashPath) ||
    (process.platform === "win32" && /^[a-zA-Z]:\//.test(slashPath))
  ) {
    throw new Error(`${label} must be relative to the Space`)
  }
  const normalized = path.posix.normalize(slashPath)
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error(`${label} must stay inside the Space`)
  }
  return normalized
}

function normalizeDiffOptions(value: unknown): SpaceVersionDiffOptions {
  if (!isObject(value)) {
    throw new Error("Diff options must be an object")
  }
  const root =
    value.root === undefined
      ? undefined
      : normalizeRevision(value.root, "Diff root target revision")
  const from =
    value.from === undefined
      ? undefined
      : normalizeRevision(value.from, "Diff source revision")
  const to =
    value.to === undefined
      ? undefined
      : normalizeRevision(value.to, "Diff target revision")
  if (root && (from || to)) {
    throw new Error("Root diff cannot include source or target revisions")
  }
  if (!root && !from) {
    throw new Error("Diff source revision is required")
  }
  const repositoryPath = normalizeRepositoryPath(value.path)
  const includeContent = value.includeContent ?? false
  if (typeof includeContent !== "boolean") {
    throw new Error("includeContent must be a boolean")
  }
  if (includeContent && (!repositoryPath || (!root && !to))) {
    throw new Error(
      "Text content diff requires a root target or two revisions and one path"
    )
  }
  return {
    ...(root === undefined ? {} : { root }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    ...(repositoryPath === undefined ? {} : { path: repositoryPath }),
    ...(includeContent ? { includeContent: true } : {}),
  }
}

function normalizeRestorePathOptions(
  value: unknown
): Required<SpaceVersionRestorePathOptions> {
  if (!isObject(value)) {
    throw new Error("Restore options must be an object")
  }
  const revision = normalizeRevision(value.revision, "Restore revision")
  const expectedHead = normalizeRevision(
    value.expectedHead,
    "Expected current version"
  )
  const repositoryPath = normalizeRepositoryPath(value.path, "Restore path")
  if (!repositoryPath) {
    throw new Error("Restore path is required")
  }
  const privatePath = repositoryPath.toLowerCase()
  if (
    privatePath === ".graft" ||
    privatePath.startsWith(".graft/") ||
    privatePath === ".eidos" ||
    privatePath.startsWith(".eidos/") ||
    privatePath === ".graftignore"
  ) {
    throw new Error("Private Space paths cannot be restored")
  }

  const overwriteChanges = value.overwriteChanges ?? false
  const allowDelete = value.allowDelete ?? false
  if (typeof overwriteChanges !== "boolean") {
    throw new Error("overwriteChanges must be a boolean")
  }
  if (typeof allowDelete !== "boolean") {
    throw new Error("allowDelete must be a boolean")
  }
  return {
    revision,
    path: repositoryPath,
    expectedHead,
    overwriteChanges,
    allowDelete,
  }
}

function normalizeRestoreOptions(
  value: unknown
): Required<SpaceVersionRestoreOptions> {
  if (!isObject(value)) {
    throw new Error("Restore options must be an object")
  }
  const revision = normalizeRevision(value.revision, "Restore revision")
  const expectedHead = normalizeRevision(
    value.expectedHead,
    "Expected current version"
  )
  const overwriteChanges = value.overwriteChanges ?? false
  if (typeof overwriteChanges !== "boolean") {
    throw new Error("overwriteChanges must be a boolean")
  }
  return { revision, expectedHead, overwriteChanges }
}

function pathsOverlap(left: string, right: string): boolean {
  return (
    left === right ||
    left.startsWith(`${right}/`) ||
    right.startsWith(`${left}/`)
  )
}

function pathStatusOverlaps(
  entries: SpaceVersionPathStatus[],
  repositoryPath: string
): SpaceVersionPathStatus[] {
  return entries.filter((entry) => pathsOverlap(entry.path, repositoryPath))
}

function isPrivateRuntimePath(repositoryPath: string): boolean {
  const candidate = repositoryPath.toLowerCase()
  if (candidate === ".graft" || candidate.startsWith(".graft/")) {
    return true
  }
  if (candidate === ".eidos/db.sqlite3") {
    return true
  }
  for (const directory of ["cache", "indexes", "sessions", "state"]) {
    const prefix = `.eidos/${directory}`
    if (candidate === prefix || candidate.startsWith(`${prefix}/`)) {
      return true
    }
  }
  return candidate.startsWith(".eidos/secrets")
}

function requireSafeRestoreTree(paths: Iterable<string>): void {
  const privatePaths = [...new Set(paths)].filter(isPrivateRuntimePath).sort()
  if (privatePaths.length > 0) {
    throw new Error(
      `A historical version contains private Eidos runtime data and cannot be restored safely: ${privatePaths.join(", ")}`
    )
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
        await ensureEidosGraftIgnore(spacePath)
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
        const args = ["diff", "--json"]
        if (options.includeContent) {
          args.push(
            "--content",
            "--max-content-bytes",
            String(TEXT_DIFF_MAX_CONTENT_BYTES)
          )
        }
        if (options.root) {
          args.push("--root", options.root)
          if (options.includeContent && options.path) {
            args.push("--", options.path)
          }
        } else {
          args.push("--", options.from!)
          if (options.to) {
            args.push(options.to)
          }
          if (options.includeContent && options.path) {
            args.push(options.path)
          }
        }
        const raw = options.includeContent
          ? await this.runner.runJson(spacePath, args, {
              maxBufferBytes: TEXT_DIFF_MAX_BUFFER_BYTES,
            })
          : await this.runner.runJson(spacePath, args)
        const diff = parseGraftDiff(
          raw,
          options.root ? "root" : options.from!,
          options.root ?? options.to ?? "worktree"
        )
        return filterDiffPath(diff, options.path)
      })
    })
  }

  async restorePath(
    spaceIdValue: unknown,
    optionsValue: unknown
  ): Promise<SpaceVersionRestorePathResult> {
    const spaceId = requireSpaceId(spaceIdValue)
    const options = normalizeRestorePathOptions(optionsValue)
    return this.withSpaceLock(spaceId, async () => {
      const spacePath = await this.resolveFileSpace(spaceId)
      await this.requireRepository(spacePath)
      return this.withRepositoryOperationLock(spacePath, async () => {
        const before = await this.readStatus(spaceId, spacePath)
        if (before.hasConflicts) {
          throw new Error("Resolve version conflicts before restoring a file")
        }
        if (before.currentHead !== options.expectedHead) {
          throw new Error(
            "The Space history changed. Refresh history before restoring this file."
          )
        }

        const overlappingChanges = pathStatusOverlaps(
          before.paths,
          options.path
        )
        if (overlappingChanges.some((entry) => entry.conflicted)) {
          throw new Error("Resolve this path's conflict before restoring it")
        }
        if (overlappingChanges.some((entry) => entry.staged)) {
          throw new Error(
            "This path has staged changes. Commit or unstage them before restoring."
          )
        }
        if (overlappingChanges.length > 0 && !options.overwriteChanges) {
          throw new Error(
            "This path has uncommitted changes. Confirm that they may be overwritten before restoring."
          )
        }

        const source = parseGraftRestoreSource(
          await this.runner.runJson(spacePath, [
            "show",
            "--json",
            "--",
            options.revision,
          ]),
          options.path
        )
        if (source.change === "renamed" || source.change === "unknown") {
          throw new Error(
            "Renamed paths cannot be restored safely in this version of Eidos"
          )
        }
        const sourceDeletesPath = source.change === "deleted"
        if (sourceDeletesPath === source.containsPath) {
          throw new Error(
            "Graft returned inconsistent file data for the selected version"
          )
        }
        if (sourceDeletesPath && !options.allowDelete) {
          throw new Error(
            "Restoring this version deletes the file and requires explicit confirmation"
          )
        }

        const target = await this.inspectRestoreTarget(spacePath, options.path)
        if (sourceDeletesPath && !target.exists) {
          return {
            revision: source.revision,
            path: source.path,
            kind: source.kind,
            storage: source.storage,
            effect: "noop",
            status: before,
          }
        }

        await this.runner.runJson(
          spacePath,
          [
            "restore",
            "--json",
            "--source",
            source.revision,
            "--",
            options.path,
          ],
          { timeoutMs: MUTATION_TIMEOUT_MS }
        )
        try {
          const status = await this.readStatus(spaceId, spacePath)
          if (status.currentHead !== before.currentHead) {
            throw new Error(
              "The current version changed while the file was being restored"
            )
          }

          const effect: SpaceVersionRestoreEffect = sourceDeletesPath
            ? "deleted"
            : !target.exists
              ? "created"
              : overlappingChanges.length === 0 &&
                  pathStatusOverlaps(status.paths, options.path).length === 0
                ? "noop"
                : "modified"
          return {
            revision: source.revision,
            path: source.path,
            kind: source.kind,
            storage: source.storage,
            effect,
            status,
          }
        } catch (error) {
          throw restoreReconciliationError(error)
        }
      })
    })
  }

  async restoreVersion(
    spaceIdValue: unknown,
    optionsValue: unknown
  ): Promise<SpaceVersionRestoreResult> {
    const spaceId = requireSpaceId(spaceIdValue)
    const options = normalizeRestoreOptions(optionsValue)
    return this.withSpaceLock(spaceId, async () => {
      const spacePath = await this.resolveFileSpace(spaceId)
      await this.requireRepository(spacePath)
      return this.withRepositoryOperationLock(spacePath, async () => {
        const before = await this.readStatus(spaceId, spacePath)
        if (before.hasConflicts) {
          throw new Error("Resolve version conflicts before restoring a Space")
        }
        if (before.currentHead !== options.expectedHead) {
          throw new Error(
            "The Space history changed. Refresh history before restoring this version."
          )
        }
        if (before.hasStagedChanges) {
          throw new Error(
            "The Space has staged changes. Commit or unstage them before restoring."
          )
        }
        if (
          (before.dirty || before.hasUnstagedChanges) &&
          !options.overwriteChanges
        ) {
          throw new Error(
            "The Space has uncommitted changes. Confirm that they may be overwritten before restoring."
          )
        }

        const source = parseGraftRestoreVersionSource(
          await this.runner.runJson(spacePath, [
            "show",
            "--json",
            "--",
            options.revision,
          ])
        )
        requireSafeRestoreTree(source.paths)

        const currentTree =
          source.revision === before.currentHead
            ? source
            : parseGraftRestoreVersionSource(
                await this.runner.runJson(spacePath, [
                  "show",
                  "--json",
                  "--",
                  before.currentHead,
                ])
              )
        if (currentTree.revision !== before.currentHead) {
          throw new Error(
            "The Space history changed. Refresh history before restoring this version."
          )
        }
        requireSafeRestoreTree(currentTree.paths)

        const rawRestore = await this.runner.runJson(
          spacePath,
          [
            "restore",
            "--json",
            "--source",
            source.revision,
            "--",
            RESTORE_VERSION_PATHSPEC,
          ],
          { timeoutMs: MUTATION_TIMEOUT_MS }
        )

        try {
          await ensureEidosGraftIgnore(spacePath)
          const status = await this.readStatus(spaceId, spacePath)
          if (status.currentHead !== before.currentHead) {
            throw new Error(
              "The current version changed while the Space was being restored"
            )
          }
          const restoredPaths = parseGraftRestorePaths(rawRestore)

          return {
            revision: source.revision,
            restoredPaths,
            status,
          }
        } catch (error) {
          throw restoreReconciliationError(error)
        }
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

  private async inspectRestoreTarget(
    spacePath: string,
    repositoryPath: string
  ): Promise<{ exists: boolean }> {
    const segments = repositoryPath.split("/")
    let currentPath = spacePath

    for (let index = 0; index < segments.length; index += 1) {
      currentPath = path.join(currentPath, segments[index])
      let stats
      try {
        stats = await fs.lstat(currentPath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { exists: false }
        }
        throw error
      }

      if (stats.isSymbolicLink()) {
        throw new Error("Restore paths cannot pass through symbolic links")
      }
      const isTarget = index === segments.length - 1
      if (!isTarget && !stats.isDirectory()) {
        throw new Error("A restore path parent is not a directory")
      }
      if (isTarget) {
        if (stats.isDirectory()) {
          throw new Error("A file version cannot replace a directory")
        }
        if (!stats.isFile()) {
          throw new Error("Only regular files can be restored")
        }
        return { exists: true }
      }
    }

    return { exists: false }
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
