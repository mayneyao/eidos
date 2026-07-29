import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

import manifest from "../../../graft-runtime-manifest.json"
import type {
  GraftSpaceStatus,
  SpaceVersionCommit,
  SpaceVersionDiff,
  SpaceVersionFileDiff,
  SpaceVersionHistory,
  SpaceVersionPathChange,
  SpaceVersionRowChange,
  SpaceVersionTableDiff,
  SpaceVersionTableSummary,
} from "../../shared/contracts"
import { resolveEidosLiteServiceEnvironment } from "../../shared/service-environment"
import type { GraftSdkTransport } from "./graft-sdk-transport"

const execFileAsync = promisify(execFile)
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024
const ERROR_OUTPUT_LIMIT = 2_000
export const GRAFT_SDK_VERSION = "0.1.0"

export type GraftBackend = "cli" | "sdk"

export interface GraftClientOptions {
  backend?: GraftBackend
  binaryPath?: string
  sdkTransport?: GraftSdkTransport
  syncRemoteOrigin?: string
}

export class GraftCliError extends Error {
  constructor(
    message: string,
    readonly command: string,
    readonly exitCode?: number
  ) {
    super(message)
    this.name = "GraftCliError"
  }
}

function redacted(value: string, token?: string): string {
  const safe = token ? value.split(token).join("[redacted]") : value
  return safe.slice(0, ERROR_OUTPUT_LIMIT)
}

function parseVersion(value: string): string | null {
  return value.match(/\bgraft-tool\s+(\d+\.\d+\.\d+)\b/)?.[1] ?? null
}

function platformBinaryName(): string {
  return process.platform === "win32" ? "graft.exe" : "graft"
}

export function defaultGraftBinaryPath(
  options: {
    packaged?: boolean
    resourcesPath?: string
  } = {}
): string {
  const configured =
    process.env.EIDOS_LITE_GRAFT_CLI_PATH ?? process.env.GRAFT_CLI_PATH
  if (configured) return path.resolve(configured)
  if (options.packaged && options.resourcesPath) {
    return path.join(options.resourcesPath, "graft", platformBinaryName())
  }
  return platformBinaryName()
}

export function isOfficialRemoteUrl(value: string, origin: string): boolean {
  const httpValue = canonicalRemoteUrl(value)
  try {
    const url = new URL(httpValue)
    return (
      url.protocol === "https:" &&
      url.origin === new URL(origin).origin &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname.split("/").filter(Boolean).length === 2
    )
  } catch {
    return false
  }
}

function canonicalRemoteUrl(value: string): string {
  return value.startsWith("graft+https://")
    ? `https://${value.slice("graft+https://".length)}`
    : value
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : []
}

function pathChange(value: unknown): SpaceVersionPathChange {
  const item = record(value)
  return {
    path: stringValue(item.path) ?? "",
    change: stringValue(item.change) ?? "modified",
    ...(stringValue(item.kind) ? { kind: stringValue(item.kind) } : {}),
    ...(stringValue(item.storage)
      ? { storage: stringValue(item.storage) }
      : {}),
  }
}

function rowChange(value: unknown): SpaceVersionRowChange {
  const item = record(value)
  return {
    op: stringValue(item.op) ?? "change",
    key: record(item.key),
    ...(Array.isArray(item.values) ? { values: item.values } : {}),
    ...(Array.isArray(item.old_values) ? { oldValues: item.old_values } : {}),
  }
}

function tableDiff(value: unknown): SpaceVersionTableDiff {
  const item = record(value)
  return {
    name: stringValue(item.name) ?? "Unknown table",
    columns: stringArray(item.columns),
    primaryKeyColumns: stringArray(item.primary_key_columns),
    changes: Array.isArray(item.changes) ? item.changes.map(rowChange) : [],
  }
}

function fileDiff(value: unknown): SpaceVersionFileDiff {
  const item = record(value)
  return {
    ...pathChange(value),
    rowDiffAvailable: item.row_diff_available === true,
    ...(stringValue(item.logical_status)
      ? { logicalStatus: stringValue(item.logical_status) }
      : {}),
    limitations: stringArray(item.limitations),
    tables: Array.isArray(item.tables) ? item.tables.map(tableDiff) : [],
  }
}

function versionDiff(value: unknown): SpaceVersionDiff {
  const item = record(value)
  return {
    currentHead: stringValue(item.current_head) ?? null,
    currentBranch: stringValue(item.current_branch) ?? null,
    from: stringValue(item.from) ?? null,
    to: stringValue(item.to) ?? null,
    paths: Array.isArray(item.paths) ? item.paths.map(pathChange) : [],
    files: Array.isArray(item.files) ? item.files.map(fileDiff) : [],
  }
}

function tableSummary(value: unknown): SpaceVersionTableSummary {
  const item = record(value)
  return {
    name: stringValue(item.name) ?? "Unknown table",
    inserts: numberValue(item.inserts),
    deletes: numberValue(item.deletes),
    updates: numberValue(item.updates),
  }
}

function commit(value: unknown): SpaceVersionCommit {
  const item = record(value)
  const changes = Array.isArray(item.changes)
    ? item.changes.map(pathChange)
    : []
  return {
    id: stringValue(item.id) ?? "",
    parent: stringValue(item.parent) ?? null,
    message: stringValue(item.message) ?? "Checkpoint",
    timestampMs: numberValue(item.timestamp_ms),
    files: changes.length,
    changes,
    tables: Array.isArray(item.tables) ? item.tables.map(tableSummary) : [],
    changedTables: numberValue(item.changed_tables),
  }
}

function versionHistory(value: unknown): SpaceVersionHistory {
  const item = record(value)
  return {
    currentHead: stringValue(item.current_head) ?? null,
    currentBranch: stringValue(item.current_branch) ?? null,
    commits: Array.isArray(item.commits) ? item.commits.map(commit) : [],
    hasMore: item.has_more === true,
  }
}

export class GraftClient {
  private verifiedVersion: Promise<string> | null = null
  private openedRoot: string | null = null
  readonly backend: GraftBackend
  readonly binaryPath: string
  readonly syncRemoteOrigin: string
  private readonly sdkTransport?: GraftSdkTransport

  constructor(
    options: GraftClientOptions | string = {},
    legacySyncRemoteOrigin?: string
  ) {
    const resolved =
      typeof options === "string"
        ? {
            backend: "cli" as const,
            binaryPath: options,
            syncRemoteOrigin: legacySyncRemoteOrigin,
          }
        : options
    this.sdkTransport = resolved.sdkTransport
    this.backend =
      resolved.backend ?? (this.sdkTransport ? "sdk" : ("cli" as const))
    this.binaryPath = resolved.binaryPath ?? defaultGraftBinaryPath()
    this.syncRemoteOrigin =
      resolved.syncRemoteOrigin ??
      resolveEidosLiteServiceEnvironment().syncRemoteOrigin
    if (this.backend === "sdk" && !this.sdkTransport) {
      throw new Error("The Graft SDK backend requires a session transport")
    }
  }

  expectedVersion(): string {
    return this.backend === "sdk" ? GRAFT_SDK_VERSION : manifest.version
  }

  async open(root: string): Promise<void> {
    const canonicalRoot = path.resolve(root)
    if (this.backend === "cli") {
      this.openedRoot = canonicalRoot
      return
    }
    await this.requireSdkTransport().open(canonicalRoot)
    this.openedRoot = canonicalRoot
    await this.version()
  }

  async close(): Promise<void> {
    this.openedRoot = null
    this.verifiedVersion = null
    if (this.backend === "sdk") await this.requireSdkTransport().close()
  }

  async reopen(): Promise<void> {
    if (this.backend === "cli") return
    if (!this.openedRoot) throw new Error("Graft repository session is closed")
    await this.requireSdkTransport().reopen()
  }

  async version(): Promise<string> {
    if (!this.verifiedVersion) {
      this.verifiedVersion = (
        this.backend === "sdk"
          ? this.requireSdkTransport()
              .command("sdkVersion")
              .then((value) => {
                if (typeof value !== "string") {
                  throw new Error("Graft SDK returned an invalid version")
                }
                return value
              })
          : execFileAsync(this.binaryPath, ["--version"], {
              encoding: "utf8",
              env: { ...process.env, NO_COLOR: "1" },
              maxBuffer: 64 * 1024,
              timeout: 30_000,
              windowsHide: true,
            }).then(({ stdout }) => {
              const version = parseVersion(stdout)
              if (!version) {
                throw new Error("Graft returned an invalid version")
              }
              return version
            })
      )
        .then((version) => {
          if (version !== this.expectedVersion()) {
            throw new Error(
              `Graft ${this.expectedVersion()} is required; found ${version}`
            )
          }
          return version
        })
        .catch((error) => {
          this.verifiedVersion = null
          throw error
        })
    }
    return this.verifiedVersion
  }

  async inspectSpace(root: string): Promise<GraftSpaceStatus> {
    let version: string
    try {
      await this.open(root)
      version = await this.version()
    } catch (error) {
      return {
        available: false,
        backend: this.backend,
        expectedVersion: this.expectedVersion(),
        initialized: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
    const initialized = await fs
      .stat(path.join(root, ".graft"))
      .then((stats) => stats.isDirectory())
      .catch(() => false)
    if (!initialized) {
      return {
        available: true,
        backend: this.backend,
        version,
        expectedVersion: this.expectedVersion(),
        initialized: false,
      }
    }
    try {
      const status = await this.status(root)
      const changedPaths = status.dirty
        ? await this.workingDiff(root, false)
            .then((diff) => diff.paths.length)
            .catch(() => undefined)
        : 0
      return {
        available: true,
        backend: this.backend,
        version,
        expectedVersion: this.expectedVersion(),
        initialized: true,
        clean: !status.dirty,
        ...(changedPaths === undefined ? {} : { changedPaths }),
        ...(status.currentHead ? { currentHead: status.currentHead } : {}),
      }
    } catch (error) {
      return {
        available: true,
        backend: this.backend,
        version,
        expectedVersion: this.expectedVersion(),
        initialized: true,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async initialize(root: string): Promise<void> {
    const initialized = await fs
      .stat(path.join(root, ".graft"))
      .then((stats) => stats.isDirectory())
      .catch(() => false)
    if (!initialized) {
      if (this.backend === "sdk") await this.runSdk(root, "init")
      else await this.runJson(root, ["init", "--json"])
    }
  }

  stageAll(root: string): Promise<unknown> {
    return this.backend === "sdk"
      ? this.runSdk(root, "addAll")
      : this.runJson(root, ["add", "--json", "-A"])
  }

  commit(root: string, message: string): Promise<unknown> {
    return this.backend === "sdk"
      ? this.runSdk(root, "commit", [message])
      : this.runJson(root, ["commit", "--json", "--message", message])
  }

  async status(root: string): Promise<{
    dirty: boolean
    currentHead: string | null
    currentBranch: string | null
    ahead: number
    behind: number
    hasConflicts: boolean
  }> {
    const value = record(
      this.backend === "sdk"
        ? await this.runSdk(root, "status")
        : await this.runJson(root, ["status", "--json"])
    )
    return {
      dirty: value.dirty === true,
      currentHead: stringValue(value.current_head) ?? null,
      currentBranch: stringValue(value.current_branch) ?? null,
      ahead: Math.max(0, Math.trunc(numberValue(value.ahead))),
      behind: Math.max(0, Math.trunc(numberValue(value.behind))),
      hasConflicts:
        value.has_conflicts === true || numberValue(value.conflicted) > 0,
    }
  }

  async workingDiff(root: string, rows = true): Promise<SpaceVersionDiff> {
    return versionDiff(
      this.backend === "sdk"
        ? await this.runSdk(root, "diff", [{ rows }])
        : await this.runJson(
            root,
            rows ? ["diff", "--rows", "--json"] : ["diff", "--json"]
          )
    )
  }

  async revisionDiff(
    root: string,
    commitId: string,
    parentId?: string | null
  ): Promise<SpaceVersionDiff> {
    if (this.backend === "sdk") {
      return versionDiff(
        await this.runSdk(root, "diff", [
          parentId
            ? { from: parentId, to: commitId, rows: true }
            : { root: commitId, rows: true },
        ])
      )
    }
    const args = parentId
      ? ["diff", parentId, commitId, "--rows", "--json"]
      : ["diff", "--root", commitId, "--rows", "--json"]
    return versionDiff(await this.runJson(root, args))
  }

  async compareRevisions(
    root: string,
    from: string,
    to: string
  ): Promise<SpaceVersionDiff> {
    return versionDiff(
      this.backend === "sdk"
        ? await this.runSdk(root, "diff", [{ from, to, rows: true }])
        : await this.runJson(root, ["diff", from, to, "--rows", "--json"])
    )
  }

  async history(root: string, limit = 50): Promise<SpaceVersionHistory> {
    return versionHistory(
      this.backend === "sdk"
        ? await this.runSdk(root, "history", [{ limit }])
        : await this.runJson(root, ["log", "--json", "--limit", String(limit)])
    )
  }

  restorePath(
    root: string,
    source: string,
    expectedHead: string,
    relativePath: string
  ): Promise<unknown> {
    if (this.backend === "sdk") {
      return this.runSdk(root, "restore", [
        {
          source,
          expectedHead,
          path: relativePath,
        },
      ])
    }
    return this.runJson(root, [
      "restore",
      "--json",
      "--source",
      source,
      "--expected-head",
      expectedHead,
      "--",
      relativePath,
    ])
  }

  addRemote(root: string, name: string, url: string): Promise<unknown> {
    if (this.backend === "sdk") {
      return this.runSdk(root, "configureRemote", [
        {
          name,
          url,
          upstreamBranch: "main",
        },
      ])
    }
    return this.runJson(root, ["remote", "add", "--json", name, url])
  }

  async remoteUrl(root: string, name = "origin"): Promise<string | null> {
    const value = record(
      this.backend === "sdk"
        ? await this.runSdk(root, "status")
        : await this.runJson(root, ["remote", "list", "--json"])
    )
    if (!Array.isArray(value.remotes)) {
      throw new Error("Graft returned an invalid remote list")
    }
    const remote = value.remotes
      .map(record)
      .find((entry) => entry.name === name)
    if (!remote) return null
    const config = record(remote.config)
    const url =
      stringValue(remote.url) ??
      stringValue(config.url) ??
      (config.type === "fs" && stringValue(config.root)
        ? `fs://${stringValue(config.root)}`
        : undefined)
    if (!url) throw new Error("Graft returned an invalid Remote URL")
    return url
  }

  setMainUpstream(root: string, name = "origin"): Promise<unknown> {
    if (this.backend === "sdk") {
      return this.remoteUrl(root, name).then((remoteUrl) => {
        if (!remoteUrl)
          throw new Error(`Graft Remote ${name} is not configured`)
        return { configured: true }
      })
    }
    return this.runJson(root, [
      "branch",
      "--json",
      "--set-upstream-to",
      `${name}/main`,
      "main",
    ])
  }

  push(root: string, token?: string): Promise<unknown> {
    if (this.backend === "sdk") {
      return this.setHttpCredential(root, "origin", token).then(() =>
        this.runSdk(root, "push", [{ remote: "origin", branch: "main" }])
      )
    }
    return this.runJson(root, ["push", "--json"], { remoteToken: token })
  }

  fetch(root: string): Promise<unknown> {
    return this.backend === "sdk"
      ? this.runSdk(root, "fetch", [{ remote: "origin", branch: "main" }])
      : this.runJson(root, ["fetch", "--json"])
  }

  pull(root: string): Promise<unknown> {
    return this.backend === "sdk"
      ? this.runSdk(root, "pull", [{ remote: "origin", branch: "main" }])
      : this.runJson(root, ["pull", "--json"])
  }

  clone(
    targetDirectory: string,
    remoteUrl: string,
    token?: string
  ): Promise<unknown> {
    if (this.backend === "sdk") {
      return this.requireSdkTransport().clone(
        path.resolve(targetDirectory),
        remoteUrl,
        token
      )
    }
    return this.runJson(targetDirectory, ["clone", "--json", remoteUrl], {
      remoteToken: token,
    })
  }

  async configureOfficialRemote(
    root: string,
    remoteUrl: string,
    token: string
  ): Promise<void> {
    if (!isOfficialRemoteUrl(remoteUrl, this.syncRemoteOrigin)) {
      throw new Error("Eidos Lite accepts only the official Eidos Sync Remote")
    }
    if (!token) throw new Error("An Eidos Sync access token is required")
    const existing = await this.remoteUrl(root)
    if (existing === null) {
      if (this.backend === "sdk") {
        await this.runSdk(root, "configureRemote", [
          {
            name: "origin",
            url: remoteUrl,
            bearerToken: token,
            upstreamBranch: "main",
          },
        ])
      } else {
        await this.addRemote(root, "origin", remoteUrl)
      }
    } else if (canonicalRemoteUrl(existing) !== canonicalRemoteUrl(remoteUrl)) {
      throw new Error(
        "This Space already has a different origin Remote. Eidos Lite will not overwrite it."
      )
    } else if (this.backend === "sdk") {
      await this.setHttpCredential(root, "origin", token)
    }
    if (this.backend === "cli") await this.setMainUpstream(root)
  }

  async clearHttpCredentials(root: string, name = "origin"): Promise<void> {
    if (this.backend !== "sdk") return
    await this.runSdk(root, "clearHttpBearerToken", [name])
  }

  async operationMaterializesWorktree(operation: string): Promise<boolean> {
    if (this.backend === "cli") {
      return ["restore", "pull", "cloneRepository"].includes(operation)
    }
    const root = this.openedRoot
    if (!root) throw new Error("Graft repository session is closed")
    const result = await this.runSdk(root, "operationMaterializesWorktree", [
      operation,
    ])
    return result === true
  }

  async verifyCrashRecoveryForTesting(root: string): Promise<boolean> {
    const terminate = this.requireSdkTransport().terminateForTesting
    if (this.backend !== "sdk" || !terminate) {
      throw new Error("Graft SDK crash probe requires a utility transport")
    }
    const before = await this.status(root)
    await terminate.call(this.requireSdkTransport())
    const after = await this.status(root)
    return (
      before.dirty === after.dirty &&
      before.currentHead === after.currentHead &&
      before.currentBranch === after.currentBranch
    )
  }

  async runJson<T = unknown>(
    root: string,
    args: readonly string[],
    options: { remoteToken?: string; timeoutMs?: number } = {}
  ): Promise<T> {
    if (this.backend !== "cli") {
      throw new Error("CLI commands are disabled for the Graft SDK backend")
    }
    await this.version()
    const command = args[0] ?? "unknown"
    try {
      const { stdout } = await execFileAsync(this.binaryPath, [...args], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          NO_COLOR: "1",
          ...(options.remoteToken
            ? { GRAFT_REMOTE_TOKEN: options.remoteToken }
            : {}),
        },
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout: options.timeoutMs ?? 120_000,
        windowsHide: true,
      })
      const output = stdout.trim()
      if (!output) throw new Error("Graft returned an empty JSON response")
      return JSON.parse(output) as T
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & {
        stderr?: string
        code?: number | string
      }
      const message = redacted(
        failure.stderr?.trim() || failure.message || "Graft command failed",
        options.remoteToken
      )
      throw new GraftCliError(
        message,
        command,
        typeof failure.code === "number" ? failure.code : undefined
      )
    }
  }

  private async runSdk<T = unknown>(
    root: string,
    command: Parameters<GraftSdkTransport["command"]>[0],
    args: unknown[] = []
  ): Promise<T> {
    const canonicalRoot = path.resolve(root)
    if (this.openedRoot && this.openedRoot !== canonicalRoot) {
      throw new Error(
        "One GraftClient cannot own more than one repository session"
      )
    }
    await this.requireSdkTransport().open(canonicalRoot)
    this.openedRoot = canonicalRoot
    return this.requireSdkTransport().command(command, args) as Promise<T>
  }

  private async setHttpCredential(
    root: string,
    name: string,
    token?: string
  ): Promise<void> {
    if (!token) return
    await this.runSdk(root, "setHttpBearerToken", [name, token])
  }

  private requireSdkTransport(): GraftSdkTransport {
    if (!this.sdkTransport) {
      throw new Error("The Graft SDK session transport is unavailable")
    }
    return this.sdkTransport
  }
}
