import { randomUUID } from "crypto"
import fs from "fs/promises"
import path from "path"

import { Injectable, Inject } from "../../common/di"
import { withFileSpaceOperationLock } from "../space-management/file-space-operation-lock"
import { SpaceRegistry } from "../space-management/space-management.module"
import { GraftRunner } from "./graft-runner"
import { ensureEidosGraftIgnore } from "./graft-ignore"
import {
  disabledSpaceVersionStatus,
  parseGraftCommit,
  parseGraftCommitResult,
  parseGraftConflicts,
  parseGraftDiff,
  parseGraftLog,
  parseGraftRemoteMutation,
  parseGraftRemotes,
  parseGraftRestorePaths,
  parseGraftRestoreSource,
  parseGraftRestoreVersionSource,
  parseGraftResolveConflict,
  parseGraftStatus,
  parseGraftSyncResult,
} from "./graft-parsers"
import type {
  SpaceVersionCommit,
  SpaceVersionCommitOptions,
  SpaceVersionCommitResult,
  SpaceVersionConflictList,
  SpaceVersionDiscardPathOptions,
  SpaceVersionDiscardPathResult,
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
  SpaceVersionConfigureRemoteOptions,
  SpaceVersionConfigureRemoteResult,
  SpaceVersionRemoteListResult,
  SpaceVersionRemoveRemoteOptions,
  SpaceVersionRemoveRemoteResult,
  SpaceVersionResolveConflictOptions,
  SpaceVersionResolveConflictResult,
  SpaceVersionStagePathOptions,
  SpaceVersionStagePathResult,
  SpaceVersionStatus,
  SpaceVersionSyncOptions,
  SpaceVersionSyncResult,
  SpaceVersionUnstagePathResult,
} from "./types"

const MUTATION_TIMEOUT_MS = 120_000
const DEFAULT_HISTORY_LIMIT = 100
const MAX_HISTORY_LIMIT = 2_000
const HISTORY_MAX_BUFFER_BYTES = 64 * 1024 * 1024
const TEXT_DIFF_MAX_CONTENT_BYTES = 1024 * 1024
const TEXT_DIFF_MAX_BUFFER_BYTES = 3 * TEXT_DIFF_MAX_CONTENT_BYTES + 1024 * 1024
const SQLITE_DIFF_MAX_BUFFER_BYTES = 16 * 1024 * 1024
const MAX_MESSAGE_LENGTH = 4_096
const MAX_REVISION_LENGTH = 512
const MAX_REMOTE_NAME_LENGTH = 128
const MAX_REMOTE_URL_LENGTH = 4_096
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

interface DiscardTargetSnapshot {
  exists: true
  device: number
  inode: number
  size: number
  mtimeMs: number
}

interface QuarantinedDiscardTarget {
  repositoryPath: string
  targetPath: string
  quarantinePath: string
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

function discardReconciliationError(error: unknown): Error {
  return new Error(
    `File changes may have been discarded, but Eidos could not verify the final version state: ${errorMessage(error)}. Refresh Changes before continuing.`
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

function normalizeExpectedHead(value: unknown): string | null {
  return value === null
    ? null
    : normalizeRevision(value, "Expected current version")
}

function normalizeRemoteWord(
  value: unknown,
  label: string,
  fallback?: string
): string {
  const candidate = value === undefined ? fallback : value
  if (
    typeof candidate !== "string" ||
    !candidate ||
    candidate.length > MAX_REVISION_LENGTH ||
    candidate.startsWith("-") ||
    candidate.includes("\0") ||
    /\s/.test(candidate)
  ) {
    throw new Error(`${label} must be one non-empty name without whitespace`)
  }
  return candidate
}

function normalizeRemoteName(value: unknown): string {
  const name = normalizeRemoteWord(value, "Remote name", "origin")
  if (name.length > MAX_REMOTE_NAME_LENGTH || name.includes("/")) {
    throw new Error(
      `Remote name cannot exceed ${MAX_REMOTE_NAME_LENGTH} characters or contain a slash`
    )
  }
  return name
}

function normalizeRemoteUrl(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Remote URL is required")
  }
  const url = value.trim()
  if (
    !url ||
    url.length > MAX_REMOTE_URL_LENGTH ||
    url.includes("\0") ||
    /[\r\n]/.test(url)
  ) {
    throw new Error("Remote URL is invalid")
  }
  if (
    url !== "memory" &&
    ![
      "fs://",
      "s3://",
      "s3_compatible://",
      "graft+https://",
      "graft+http://",
    ].some((prefix) => url.startsWith(prefix))
  ) {
    throw new Error(
      "Remote URL must use memory, fs://, s3://, s3_compatible://, graft+https://, or graft+http://"
    )
  }
  return url
}

function normalizeConfigureRemoteOptions(
  value: unknown
): SpaceVersionConfigureRemoteOptions & { name: string; url: string } {
  if (!isObject(value)) {
    throw new Error("Remote options must be an object")
  }
  return {
    name: normalizeRemoteName(value.name),
    url: normalizeRemoteUrl(value.url),
    branch:
      value.branch === undefined
        ? undefined
        : normalizeRemoteWord(value.branch, "Remote branch"),
  }
}

function normalizeRemoveRemoteOptions(
  value: unknown
): Required<SpaceVersionRemoveRemoteOptions> {
  if (value !== undefined && !isObject(value)) {
    throw new Error("Remote options must be an object")
  }
  return { name: normalizeRemoteName(isObject(value) ? value.name : undefined) }
}

interface NormalizedSyncOptions {
  remote: string
  branch?: string
  expectedHead?: string | null
}

function normalizeSyncOptions(value: unknown): NormalizedSyncOptions {
  if (value !== undefined && !isObject(value)) {
    throw new Error("Sync options must be an object")
  }
  const options = isObject(value) ? value : {}
  return {
    remote: normalizeRemoteName(options.remote),
    branch:
      options.branch === undefined
        ? undefined
        : normalizeRemoteWord(options.branch, "Remote branch"),
    expectedHead:
      options.expectedHead === undefined
        ? undefined
        : normalizeExpectedHead(options.expectedHead),
  }
}

function normalizeResolveConflictOptions(
  value: unknown
): SpaceVersionResolveConflictOptions {
  if (!isObject(value)) {
    throw new Error("Conflict resolution options must be an object")
  }
  const repositoryPath = normalizeRepositoryPath(value.path, "Conflict path")
  if (!repositoryPath || isPrivateVersionPath(repositoryPath)) {
    throw new Error("Conflict path is invalid")
  }
  if (
    value.resolution !== "ours" &&
    value.resolution !== "theirs" &&
    value.resolution !== "manual"
  ) {
    throw new Error("Conflict resolution must be ours, theirs, or manual")
  }
  let target: SpaceVersionResolveConflictOptions["target"]
  if (value.target !== undefined) {
    if (!isObject(value.target)) {
      throw new Error("Row conflict target must be an object")
    }
    const table = value.target.table
    const rowId = value.target.rowId
    if (
      typeof table !== "string" ||
      !table.trim() ||
      table.length > 255 ||
      table.startsWith("-") ||
      table.includes("\0")
    ) {
      throw new Error("Row conflict table is invalid")
    }
    if (typeof rowId !== "number" || !Number.isSafeInteger(rowId)) {
      throw new Error("Row conflict row ID is invalid")
    }
    if (value.resolution === "manual") {
      throw new Error("Row conflicts must keep ours or accept theirs")
    }
    target = { table, rowId }
  }
  return {
    path: repositoryPath,
    resolution: value.resolution,
    expectedHead: normalizeExpectedHead(value.expectedHead),
    target,
  }
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
  if (includeContent && !repositoryPath) {
    throw new Error(
      "Text content diff requires a source or root target and one path"
    )
  }
  const includeRows = value.includeRows ?? false
  if (typeof includeRows !== "boolean") {
    throw new Error("includeRows must be a boolean")
  }
  if (includeContent && includeRows) {
    throw new Error("Text content and SQLite rows cannot be requested together")
  }
  if (includeRows && !repositoryPath) {
    throw new Error("SQLite row diff requires one path")
  }
  return {
    ...(root === undefined ? {} : { root }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    ...(repositoryPath === undefined ? {} : { path: repositoryPath }),
    ...(includeContent ? { includeContent: true } : {}),
    ...(includeRows ? { includeRows: true } : {}),
  }
}

function isPrivateVersionPath(repositoryPath: string): boolean {
  const privatePath = repositoryPath.toLowerCase()
  const isProductExtension = privatePath.startsWith(".eidos/extensions/")
  return (
    privatePath === ".graft" ||
    privatePath.startsWith(".graft/") ||
    privatePath === ".eidos" ||
    (privatePath.startsWith(".eidos/") && !isProductExtension)
  )
}

function normalizeVersionPath(
  value: unknown,
  label: string,
  allowGraftIgnore = false
): string {
  const repositoryPath = normalizeRepositoryPath(value, label)
  if (!repositoryPath) {
    throw new Error(`${label} is required`)
  }
  if (
    isPrivateVersionPath(repositoryPath) ||
    (!allowGraftIgnore && repositoryPath.toLowerCase() === ".graftignore")
  ) {
    throw new Error("Private Space paths cannot be changed through versioning")
  }
  return repositoryPath
}

function normalizeStagePathOptions(
  value: unknown
): SpaceVersionStagePathOptions {
  if (!isObject(value)) {
    throw new Error("Stage options must be an object")
  }
  return {
    path: normalizeVersionPath(value.path, "Stage path", true),
    expectedHead: normalizeExpectedHead(value.expectedHead),
  }
}

function normalizeDiscardPathOptions(
  value: unknown
): Required<SpaceVersionDiscardPathOptions> {
  if (!isObject(value)) {
    throw new Error("Discard options must be an object")
  }
  if (value.confirmed !== true) {
    throw new Error("Discarding file changes requires explicit confirmation")
  }
  return {
    path: normalizeVersionPath(value.path, "Discard path", true),
    expectedHead: normalizeExpectedHead(value.expectedHead),
    confirmed: true,
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
  const repositoryPath = normalizeVersionPath(value.path, "Restore path")

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
  if (
    candidate === ".eidos/db.sqlite3" ||
    candidate === ".eidos/inbox.sqlite3" ||
    candidate === ".eidos/raw.sqlite3"
  ) {
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

function visibleVersionStatus(status: SpaceVersionStatus): SpaceVersionStatus {
  const privatePaths = status.paths.filter((entry) =>
    isPrivateVersionPath(entry.path)
  )
  const paths = status.paths.filter(
    (entry) => !isPrivateVersionPath(entry.path)
  )
  const counts = {
    unstaged: Math.max(
      0,
      Math.max(status.counts.unstaged, status.hasUnstagedChanges ? 1 : 0) -
        privatePaths.filter(
          (entry) =>
            entry.worktreeState !== "none" && entry.worktreeState !== "unknown"
        ).length
    ),
    staged: Math.max(
      0,
      Math.max(status.counts.staged, status.hasStagedChanges ? 1 : 0) -
        privatePaths.filter((entry) => entry.staged).length
    ),
    conflicted: Math.max(
      0,
      Math.max(status.counts.conflicted, status.hasConflicts ? 1 : 0) -
        privatePaths.filter((entry) => entry.conflicted).length
    ),
  }
  const hasUnstagedChanges = counts.unstaged > 0
  const hasStagedChanges = counts.staged > 0
  const hasConflicts = counts.conflicted > 0
  return {
    ...status,
    paths,
    counts,
    dirty: hasUnstagedChanges || hasStagedChanges || hasConflicts,
    hasUnstagedChanges,
    hasStagedChanges,
    hasConflicts,
  }
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
    sqliteFiles: diff.sqliteFiles.filter(
      (entry) =>
        entry.path === repositoryPath || entry.path.startsWith(descendantPrefix)
    ),
  }
}

@Injectable()
export class SpaceVersioningCoordinator {
  constructor(
    @Inject(SpaceRegistry) private readonly registry: SpaceRegistry,
    @Inject(GraftRunner) private readonly runner: GraftRunner
  ) {}

  async getStatus(spaceIdValue: unknown): Promise<SpaceVersionStatus> {
    const spaceId = requireSpaceId(spaceIdValue)
    return this.withSpaceLock(spaceId, async () => {
      const spacePath = await this.resolveFileSpace(spaceId)
      if (!(await this.hasRepository(spacePath))) {
        return disabledSpaceVersionStatus(spaceId)
      }
      return this.withRepositoryOperationLock(spacePath, async () => {
        await ensureEidosGraftIgnore(spacePath, { appendToExisting: false })
        return this.readStatus(spaceId, spacePath)
      })
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

  async getRemotes(
    spaceIdValue: unknown
  ): Promise<SpaceVersionRemoteListResult> {
    const spaceId = requireSpaceId(spaceIdValue)
    return this.withSpaceLock(spaceId, async () => {
      const spacePath = await this.resolveFileSpace(spaceId)
      await this.requireRepository(spacePath)
      return this.withRepositoryOperationLock(spacePath, async () =>
        parseGraftRemotes(
          await this.runner.runJson(spacePath, ["remote", "list", "--json"])
        )
      )
    })
  }

  async configureRemote(
    spaceIdValue: unknown,
    optionsValue: unknown
  ): Promise<SpaceVersionConfigureRemoteResult> {
    const spaceId = requireSpaceId(spaceIdValue)
    const options = normalizeConfigureRemoteOptions(optionsValue)
    return this.withSpaceLock(spaceId, async () => {
      const spacePath = await this.resolveFileSpace(spaceId)
      await this.requireRepository(spacePath)
      return this.withRepositoryOperationLock(spacePath, async () => {
        const status = await this.readStatus(spaceId, spacePath)
        const localBranch = status.currentBranch
        if (!localBranch) {
          throw new Error(
            "Create the first version before configuring a remote Space"
          )
        }
        const remoteBranch = options.branch ?? localBranch
        const remotes = parseGraftRemotes(
          await this.runner.runJson(spacePath, ["remote", "list", "--json"])
        )
        const previous = remotes.remotes.find(
          (remote) => remote.name === options.name
        )
        const operation = previous ? "set-url" : "add"
        const remote = parseGraftRemoteMutation(
          await this.runner.runJson(spacePath, [
            "remote",
            operation,
            "--json",
            options.name,
            options.url,
          ])
        )

        try {
          await this.runner.runJson(spacePath, [
            "branch-upstream",
            "--json",
            localBranch,
            `${options.name}/${remoteBranch}`,
          ])
        } catch (error) {
          try {
            await this.runner.runJson(
              spacePath,
              previous
                ? ["remote", "set-url", "--json", previous.name, previous.url]
                : ["remote", "remove", "--json", options.name]
            )
          } catch (rollbackError) {
            throw new Error(
              `${errorMessage(error)} (also failed to restore the previous remote configuration: ${errorMessage(rollbackError)})`
            )
          }
          throw error
        }

        this.registry.setSpaceSync(spaceId, {
          enabled: true,
          remote: remote.url,
          provider: "graft",
        })
        return {
          remote,
          status: await this.readStatus(spaceId, spacePath),
        }
      })
    })
  }

  async removeRemote(
    spaceIdValue: unknown,
    optionsValue: unknown = {}
  ): Promise<SpaceVersionRemoveRemoteResult> {
    const spaceId = requireSpaceId(spaceIdValue)
    const options = normalizeRemoveRemoteOptions(optionsValue)
    return this.withSpaceLock(spaceId, async () => {
      const spacePath = await this.resolveFileSpace(spaceId)
      await this.requireRepository(spacePath)
      return this.withRepositoryOperationLock(spacePath, async () => {
        await this.runner.runJson(spacePath, [
          "remote",
          "remove",
          "--json",
          options.name,
        ])
        const remotes = parseGraftRemotes(
          await this.runner.runJson(spacePath, ["remote", "list", "--json"])
        ).remotes
        this.registry.setSpaceSync(spaceId, {
          enabled: remotes.length > 0,
          remote: remotes[0]?.url ?? "",
          provider: "graft",
        })
        return {
          name: options.name,
          status: await this.readStatus(spaceId, spacePath),
        }
      })
    })
  }

  async fetchRemote(
    spaceIdValue: unknown,
    optionsValue: unknown = {}
  ): Promise<SpaceVersionSyncResult> {
    return this.syncRemote("fetch", spaceIdValue, optionsValue)
  }

  async pullRemote(
    spaceIdValue: unknown,
    optionsValue: unknown = {}
  ): Promise<SpaceVersionSyncResult> {
    return this.syncRemote("pull", spaceIdValue, optionsValue)
  }

  async pushRemote(
    spaceIdValue: unknown,
    optionsValue: unknown = {}
  ): Promise<SpaceVersionSyncResult> {
    return this.syncRemote("push", spaceIdValue, optionsValue)
  }

  async getConflicts(spaceIdValue: unknown): Promise<SpaceVersionConflictList> {
    const spaceId = requireSpaceId(spaceIdValue)
    return this.withSpaceLock(spaceId, async () => {
      const spacePath = await this.resolveFileSpace(spaceId)
      await this.requireRepository(spacePath)
      return this.withRepositoryOperationLock(spacePath, async () => {
        const conflicts = parseGraftConflicts(
          await this.runner.runJson(spacePath, ["conflicts", "--json"])
        )
        return {
          ...conflicts,
          paths: conflicts.paths.filter(
            (entry) => !isPrivateVersionPath(entry.path)
          ),
          conflicts: conflicts.conflicts.filter(
            (entry) => !isPrivateVersionPath(entry.path)
          ),
        }
      })
    })
  }

  async resolveConflict(
    spaceIdValue: unknown,
    optionsValue: unknown
  ): Promise<SpaceVersionResolveConflictResult> {
    const spaceId = requireSpaceId(spaceIdValue)
    const options = normalizeResolveConflictOptions(optionsValue)
    return this.withSpaceLock(spaceId, async () => {
      const spacePath = await this.resolveFileSpace(spaceId)
      await this.requireRepository(spacePath)
      return this.withRepositoryOperationLock(spacePath, async () => {
        const before = await this.readStatus(spaceId, spacePath)
        if (before.currentHead !== options.expectedHead) {
          throw new Error(
            "The Space history changed. Refresh conflicts before resolving this path."
          )
        }
        const conflict = before.paths.find(
          (entry) => entry.path === options.path && entry.conflicted
        )
        if (!conflict) {
          throw new Error("This path no longer has an unresolved conflict")
        }
        const result = parseGraftResolveConflict(
          await this.runner.runJson(
            spacePath,
            [
              "resolve",
              "--json",
              `--${options.resolution}`,
              ...(options.target
                ? ["--row", options.target.table, String(options.target.rowId)]
                : []),
              "--path",
              options.path,
            ],
            { timeoutMs: MUTATION_TIMEOUT_MS }
          )
        )
        const status = await this.readStatus(spaceId, spacePath)
        if (status.currentHead !== before.currentHead) {
          throw new Error(
            "The current version changed while the conflict was being resolved"
          )
        }
        return { ...result, status }
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
        await ensureEidosGraftIgnore(spacePath, { appendToExisting: false })
        const before = await this.readStatus(spaceId, spacePath)
        if (before.hasConflicts) {
          throw new Error("Resolve version conflicts before committing")
        }

        if (!before.hasStagedChanges) {
          throw new Error("Stage changes before creating a version")
        }

        const raw = await this.runner.runJson(
          spacePath,
          before.mergeHead
            ? ["merge-continue", "--json", options.message]
            : ["commit", "--json", "-m", options.message],
          { timeoutMs: MUTATION_TIMEOUT_MS }
        )
        return parseGraftCommitResult(raw)
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
          await this.runner.runJson(
            spacePath,
            [
              "log",
              "--json",
              "--limit",
              String(options.limit),
              ...(options.cursor ? ["--after", options.cursor] : []),
            ],
            {
              maxBufferBytes: HISTORY_MAX_BUFFER_BYTES,
            }
          )
        )
        return {
          currentHead: history.currentHead,
          currentBranch: history.currentBranch,
          commits: history.commits,
          nextCursor: history.nextCursor,
          hasMore: history.hasMore,
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
        if (options.includeRows) {
          args.push("--rows")
        }
        if (options.root) {
          args.push("--root", options.root)
          if ((options.includeContent || options.includeRows) && options.path) {
            args.push("--", options.path)
          }
        } else {
          args.push(options.from!)
          if (options.to) {
            args.push(options.to)
          }
          if ((options.includeContent || options.includeRows) && options.path) {
            args.push("--", options.path)
          }
        }
        const raw =
          options.includeContent || options.includeRows
            ? await this.runner.runJson(spacePath, args, {
                maxBufferBytes: options.includeRows
                  ? SQLITE_DIFF_MAX_BUFFER_BYTES
                  : TEXT_DIFF_MAX_BUFFER_BYTES,
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

  async stagePath(
    spaceIdValue: unknown,
    optionsValue: unknown
  ): Promise<SpaceVersionStagePathResult> {
    const spaceId = requireSpaceId(spaceIdValue)
    const options = normalizeStagePathOptions(optionsValue)
    return this.withSpaceLock(spaceId, async () => {
      const spacePath = await this.resolveFileSpace(spaceId)
      await this.requireRepository(spacePath)
      return this.withRepositoryOperationLock(spacePath, async () => {
        const before = await this.readStatus(spaceId, spacePath)
        if (before.currentHead !== options.expectedHead) {
          throw new Error(
            "The Space history changed. Refresh Changes before including this file."
          )
        }
        const changes = before.paths.filter(
          (entry) =>
            entry.path === options.path ||
            entry.path.startsWith(`${options.path}/`)
        )
        if (changes.length === 0) {
          throw new Error("This path no longer has changes to include")
        }
        if (changes.some((change) => change.conflicted)) {
          throw new Error("Resolve conflicts in this path before including it")
        }
        if (
          changes.every(
            (change) => change.worktreeState === "none" && change.staged
          )
        ) {
          return { path: options.path, status: before }
        }

        await this.runner.runJson(
          spacePath,
          ["add", "--json", "--", options.path],
          { timeoutMs: MUTATION_TIMEOUT_MS }
        )
        const status = await this.readStatus(spaceId, spacePath)
        if (status.currentHead !== before.currentHead) {
          throw new Error(
            "The current version changed while the file was being included"
          )
        }
        return { path: options.path, status }
      })
    })
  }

  async unstagePath(
    spaceIdValue: unknown,
    optionsValue: unknown
  ): Promise<SpaceVersionUnstagePathResult> {
    const spaceId = requireSpaceId(spaceIdValue)
    const options = normalizeStagePathOptions(optionsValue)
    return this.withSpaceLock(spaceId, async () => {
      const spacePath = await this.resolveFileSpace(spaceId)
      await this.requireRepository(spacePath)
      return this.withRepositoryOperationLock(spacePath, async () => {
        const before = await this.readStatus(spaceId, spacePath)
        if (before.currentHead !== options.expectedHead) {
          throw new Error(
            "The Space history changed. Refresh Changes before excluding this file."
          )
        }
        const changes = before.paths.filter(
          (entry) =>
            entry.path === options.path ||
            entry.path.startsWith(`${options.path}/`)
        )
        if (changes.length === 0) {
          throw new Error("This path no longer has changes to exclude")
        }
        if (changes.some((change) => change.conflicted)) {
          throw new Error("Resolve conflicts in this path before excluding it")
        }
        if (changes.every((change) => !change.staged)) {
          return { path: options.path, status: before }
        }

        await this.runner.runJson(
          spacePath,
          [
            "restore",
            "--json",
            "--staged",
            ...(options.expectedHead
              ? ["--expected-head", options.expectedHead]
              : []),
            "--",
            options.path,
          ],
          { timeoutMs: MUTATION_TIMEOUT_MS }
        )
        const status = await this.readStatus(spaceId, spacePath)
        if (status.currentHead !== before.currentHead) {
          throw new Error(
            "The current version changed while the file was being excluded"
          )
        }
        return { path: options.path, status }
      })
    })
  }

  async discardPath(
    spaceIdValue: unknown,
    optionsValue: unknown
  ): Promise<SpaceVersionDiscardPathResult> {
    const spaceId = requireSpaceId(spaceIdValue)
    const options = normalizeDiscardPathOptions(optionsValue)
    return this.withSpaceLock(spaceId, async () => {
      const spacePath = await this.resolveFileSpace(spaceId)
      await this.requireRepository(spacePath)
      return this.withRepositoryOperationLock(spacePath, async () => {
        const before = await this.readStatus(spaceId, spacePath)
        if (before.currentHead !== options.expectedHead) {
          throw new Error(
            "The Space history changed. Refresh Changes before discarding this path."
          )
        }
        const changes = before.paths.filter(
          (entry) =>
            entry.path === options.path ||
            entry.path.startsWith(`${options.path}/`)
        )
        if (changes.length === 0) {
          return { path: options.path, effect: "noop", status: before }
        }
        if (changes.some((change) => change.conflicted)) {
          throw new Error("Resolve conflicts in this path before discarding it")
        }

        const disposableChanges = changes.filter(
          (change) =>
            change.worktreeState === "untracked" ||
            (change.staged && change.indexState === "added")
        )
        const disposableTargets = await Promise.all(
          disposableChanges.map(async (change) => ({
            repositoryPath: change.path,
            target: await this.inspectRestoreTarget(spacePath, change.path),
          }))
        )
        const quarantined = await this.quarantineDiscardTargets(
          spacePath,
          disposableTargets.flatMap(({ repositoryPath, target }) =>
            target.exists ? [{ repositoryPath, target }] : []
          )
        )
        const requiresWorktreeRestore = changes.some(
          (change) =>
            change.worktreeState !== "untracked" &&
            !(change.staged && change.indexState === "added")
        )
        const hasStagedChanges = changes.some((change) => change.staged)
        const directoryDiscard = changes.some(
          (change) => change.path !== options.path
        )
        const expectedHeadArgs = options.expectedHead
          ? ["--expected-head", options.expectedHead]
          : []

        try {
          if (requiresWorktreeRestore) {
            if (!options.expectedHead) {
              throw new Error(
                "Tracked files cannot be discarded before the first version exists"
              )
            }
            await this.runner.runJson(
              spacePath,
              [
                "restore",
                "--json",
                "--expected-head",
                options.expectedHead,
                "--source",
                options.expectedHead,
                "--",
                options.path,
              ],
              { timeoutMs: MUTATION_TIMEOUT_MS }
            )
          }

          if (hasStagedChanges) {
            await this.runner.runJson(
              spacePath,
              [
                "restore",
                "--json",
                "--staged",
                ...expectedHeadArgs,
                "--",
                options.path,
              ],
              { timeoutMs: MUTATION_TIMEOUT_MS }
            )
          }

          const status = await this.readStatus(spaceId, spacePath)
          if (status.currentHead !== before.currentHead) {
            throw new Error(
              "The current version changed while the path was being discarded"
            )
          }
          if (pathStatusOverlaps(status.paths, options.path).length > 0) {
            throw new Error(
              "Files in this path changed after discard was confirmed. Refresh Changes and try again."
            )
          }
          if (directoryDiscard) {
            await this.pruneEmptyDiscardDirectories(spacePath, options.path)
          }
          await this.finalizeQuarantinedDiscardTargets(quarantined)
          return {
            path: options.path,
            effect:
              disposableChanges.length === changes.length
                ? "deleted"
                : "restored",
            status,
          }
        } catch (error) {
          const preserved =
            await this.rollbackQuarantinedDiscardTargets(quarantined)
          if (preserved.length > 0) {
            throw new Error(
              `${errorMessage(error)} Original files were preserved in Graft quarantine: ${preserved.join(", ")}`
            )
          }
          throw discardReconciliationError(error)
        }
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

        const restoreArgs = [
          "restore",
          "--json",
          "--expected-head",
          options.expectedHead,
        ]
        if (!options.overwriteChanges) {
          restoreArgs.push("--require-clean")
        }
        restoreArgs.push("--source", source.revision, "--", options.path)
        await this.runner.runJson(spacePath, restoreArgs, {
          timeoutMs: MUTATION_TIMEOUT_MS,
        })
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

        const restoreArgs = [
          "restore",
          "--json",
          "--expected-head",
          options.expectedHead,
        ]
        if (!options.overwriteChanges) {
          restoreArgs.push("--require-clean")
        }
        restoreArgs.push(
          "--source",
          source.revision,
          "--",
          RESTORE_VERSION_PATHSPEC
        )
        const rawRestore = await this.runner.runJson(spacePath, restoreArgs, {
          timeoutMs: MUTATION_TIMEOUT_MS,
        })

        try {
          await ensureEidosGraftIgnore(spacePath, { appendToExisting: false })
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

  private async syncRemote(
    operation: SpaceVersionSyncResult["operation"],
    spaceIdValue: unknown,
    optionsValue: unknown
  ): Promise<SpaceVersionSyncResult> {
    const spaceId = requireSpaceId(spaceIdValue)
    const options = normalizeSyncOptions(optionsValue)
    return this.withSpaceLock(spaceId, async () => {
      const spacePath = await this.resolveFileSpace(spaceId)
      await this.requireRepository(spacePath)
      return this.withRepositoryOperationLock(spacePath, async () => {
        const before = await this.readStatus(spaceId, spacePath)
        if (
          options.expectedHead !== undefined &&
          before.currentHead !== options.expectedHead
        ) {
          throw new Error(
            "The Space history changed. Refresh Version before synchronizing."
          )
        }
        if (!before.remoteNames?.includes(options.remote)) {
          throw new Error(`Remote '${options.remote}' is not configured`)
        }
        if (operation === "pull" && before.dirty) {
          throw new Error(
            "Commit or discard local changes before pulling remote versions"
          )
        }
        if (operation !== "fetch" && before.hasConflicts) {
          throw new Error("Resolve version conflicts before synchronizing")
        }
        if (operation === "push" && !before.currentHead) {
          throw new Error("Create the first version before pushing")
        }

        const raw = await this.runner.runJson(
          spacePath,
          [
            operation,
            "--json",
            options.remote,
            ...(options.branch ? [options.branch] : []),
          ],
          { timeoutMs: MUTATION_TIMEOUT_MS }
        )
        return {
          ...parseGraftSyncResult(raw, operation),
          status: await this.readStatus(spaceId, spacePath),
        }
      })
    })
  }

  private async readStatus(
    spaceId: string,
    spacePath: string
  ): Promise<SpaceVersionStatus> {
    return visibleVersionStatus(
      parseGraftStatus(
        await this.runner.runJson(spacePath, ["status", "--json"]),
        spaceId
      )
    )
  }

  private async inspectRestoreTarget(
    spacePath: string,
    repositoryPath: string
  ): Promise<
    | { exists: false }
    | {
        exists: true
        device: number
        inode: number
        size: number
        mtimeMs: number
      }
  > {
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
        return {
          exists: true,
          device: stats.dev,
          inode: stats.ino,
          size: stats.size,
          mtimeMs: stats.mtimeMs,
        }
      }
    }

    return { exists: false }
  }

  private async quarantineDiscardTargets(
    spacePath: string,
    targets: Array<{
      repositoryPath: string
      target: DiscardTargetSnapshot
    }>
  ): Promise<QuarantinedDiscardTarget[]> {
    const quarantined: QuarantinedDiscardTarget[] = []
    try {
      for (const { repositoryPath, target } of targets) {
        const targetPath = path.join(spacePath, ...repositoryPath.split("/"))
        const quarantinePath = path.join(
          spacePath,
          ".graft",
          `.eidos-discard-${randomUUID()}`
        )
        try {
          await fs.rename(targetPath, quarantinePath)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") continue
          throw error
        }
        quarantined.push({ repositoryPath, targetPath, quarantinePath })
        const moved = await fs.lstat(quarantinePath)
        if (
          !moved.isFile() ||
          moved.dev !== target.device ||
          moved.ino !== target.inode ||
          moved.size !== target.size ||
          moved.mtimeMs !== target.mtimeMs
        ) {
          throw new Error(
            `${repositoryPath} changed after discard was confirmed`
          )
        }
      }
      return quarantined
    } catch (error) {
      const preserved =
        await this.rollbackQuarantinedDiscardTargets(quarantined)
      if (preserved.length > 0) {
        throw new Error(
          `${errorMessage(error)} Original files were preserved in Graft quarantine: ${preserved.join(", ")}`
        )
      }
      throw error
    }
  }

  private async rollbackQuarantinedDiscardTargets(
    quarantined: QuarantinedDiscardTarget[]
  ): Promise<string[]> {
    const preserved: string[] = []
    for (const entry of [...quarantined].reverse()) {
      try {
        await fs.lstat(entry.targetPath)
        preserved.push(
          `${entry.repositoryPath} (${path.basename(entry.quarantinePath)})`
        )
        continue
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          preserved.push(
            `${entry.repositoryPath} (${path.basename(entry.quarantinePath)})`
          )
          continue
        }
      }
      try {
        await fs.mkdir(path.dirname(entry.targetPath), { recursive: true })
        await fs.rename(entry.quarantinePath, entry.targetPath)
      } catch {
        preserved.push(
          `${entry.repositoryPath} (${path.basename(entry.quarantinePath)})`
        )
      }
    }
    return preserved
  }

  private async finalizeQuarantinedDiscardTargets(
    quarantined: QuarantinedDiscardTarget[]
  ): Promise<void> {
    await Promise.all(
      quarantined.map((entry) => fs.unlink(entry.quarantinePath))
    )
  }

  private async pruneEmptyDiscardDirectories(
    spacePath: string,
    repositoryPath: string
  ): Promise<void> {
    const root = path.join(spacePath, ...repositoryPath.split("/"))
    const prune = async (directory: string): Promise<void> => {
      let entries
      try {
        const stats = await fs.lstat(directory)
        if (!stats.isDirectory() || stats.isSymbolicLink()) return
        entries = await fs.readdir(directory, { withFileTypes: true })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return
        throw error
      }
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          await prune(path.join(directory, entry.name))
        }
      }
      try {
        await fs.rmdir(directory)
      } catch (error) {
        if (
          !["ENOENT", "ENOTEMPTY", "EEXIST"].includes(
            (error as NodeJS.ErrnoException).code ?? ""
          )
        ) {
          throw error
        }
      }
    }
    await prune(root)
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
    return withFileSpaceOperationLock(spaceId, operation)
  }
}
