import { randomUUID } from "node:crypto"
import {
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import {
  analyzeExtensionManifest,
  EXTENSION_LOCK_FILENAME,
  parseExtensionLock,
  type ExtensionLockV1,
} from "@eidos.space/extension-manifest"
import {
  inspectExtensionPackageSnapshot,
  type ExtensionPackageSnapshot,
} from "@eidos.space/extension-manifest/node"
import { diffExtensionFiles, diffExtensionPermissions } from "./diff"
import { resolveGitHubExtensionSnapshot } from "./github"
import type {
  CommitPreparedExtensionInstallOptions,
  ExtensionInstallTargetSnapshot,
  ExtensionInstallFile,
  PrepareGitHubExtensionInstallOptions,
  PreparedExtensionInstall,
} from "./types"

const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true })

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  )
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  )
}

function extensionManifestText(files: readonly ExtensionInstallFile[]): string {
  const file = files.find((candidate) => candidate.path === "extension.json")
  if (!file)
    throw new Error("GitHub repository root does not contain extension.json")
  try {
    return STRICT_UTF8.decode(file.content)
  } catch {
    throw new Error("extension.json must be valid UTF-8")
  }
}

function serializeLock(lock: ExtensionLockV1): string {
  return `${JSON.stringify(lock, null, 2)}\n`
}

async function writeSnapshotFiles(
  packageRoot: string,
  files: readonly ExtensionInstallFile[]
): Promise<void> {
  for (const file of files) {
    const target = path.join(packageRoot, ...file.path.split("/"))
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
    await writeFile(target, file.content, { flag: "wx", mode: 0o644 })
  }
}

export function extensionLockFromSnapshot(
  snapshot: ExtensionPackageSnapshot
): ExtensionLockV1 | undefined {
  const lockFile = snapshot.files.find(
    (file) => file.path === EXTENSION_LOCK_FILENAME
  )
  if (!lockFile) return undefined
  let text: string
  try {
    text = STRICT_UTF8.decode(lockFile.content)
  } catch {
    return undefined
  }
  return parseExtensionLock(text).lock
}

export async function readExtensionInstallTarget(
  packageRoot: string,
  hostVersion: string
): Promise<ExtensionInstallTargetSnapshot | undefined> {
  try {
    const stats = await lstat(packageRoot)
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error("Installed extension target must be a real directory")
    }
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
  const snapshot = await inspectExtensionPackageSnapshot(packageRoot, {
    hostVersion,
  })
  const lock = extensionLockFromSnapshot(snapshot)
  return {
    inspection: snapshot.inspection,
    files: snapshot.files,
    lock,
    locallyModified: Boolean(
      lock && snapshot.inspection.contentDigest !== lock.contentDigest
    ),
  }
}

export async function prepareGitHubExtensionInstall(
  options: PrepareGitHubExtensionInstallOptions
): Promise<PreparedExtensionInstall> {
  const resolved = await resolveGitHubExtensionSnapshot(options.request, {
    fetch: options.fetch,
    maxArchiveBytes: options.maxArchiveBytes,
  })
  const manifestAnalysis = analyzeExtensionManifest(
    extensionManifestText(resolved.files),
    { hostVersion: options.hostVersion }
  )
  if (!manifestAnalysis.valid || !manifestAnalysis.canonicalId) {
    const reason = manifestAnalysis.diagnostics
      .map((item) => item.message)
      .join("; ")
    throw new Error(
      `GitHub extension manifest is invalid${reason ? `: ${reason}` : ""}`
    )
  }
  if (manifestAnalysis.compatible === false) {
    throw new Error(
      "GitHub extension is not compatible with this Eidos version"
    )
  }

  await mkdir(options.stagingParent, { recursive: true, mode: 0o700 })
  const stagingRoot = await mkdtemp(
    path.join(
      options.stagingParent,
      `${manifestAnalysis.canonicalId}-${randomUUID()}-`
    )
  )
  const packageRoot = path.join(stagingRoot, manifestAnalysis.canonicalId)
  try {
    await mkdir(packageRoot, { mode: 0o700 })
    await writeSnapshotFiles(packageRoot, resolved.files)
    const beforeLock = await inspectExtensionPackageSnapshot(packageRoot, {
      hostVersion: options.hostVersion,
    })
    if (
      beforeLock.inspection.status !== "ready" ||
      beforeLock.inspection.canonicalId !== manifestAnalysis.canonicalId ||
      !beforeLock.inspection.contentDigest
    ) {
      const reason = beforeLock.inspection.diagnostics
        .map((item) => item.message)
        .join("; ")
      throw new Error(
        `GitHub extension package failed inspection${reason ? `: ${reason}` : ""}`
      )
    }
    const lock: ExtensionLockV1 = {
      lockVersion: 1,
      source: resolved.source,
      contentDigest: beforeLock.inspection.contentDigest,
    }
    await writeFile(
      path.join(packageRoot, EXTENSION_LOCK_FILENAME),
      serializeLock(lock),
      {
        flag: "wx",
        mode: 0o644,
      }
    )
    const candidate = await inspectExtensionPackageSnapshot(packageRoot, {
      hostVersion: options.hostVersion,
    })
    if (
      candidate.inspection.status !== "ready" ||
      candidate.inspection.contentDigest !== lock.contentDigest ||
      !candidate.inspection.permissionHash
    ) {
      throw new Error(
        "Staged GitHub extension changed while its lock was written"
      )
    }

    const destination = path.join(
      options.extensionsRoot,
      manifestAnalysis.canonicalId
    )
    const current = await readExtensionInstallTarget(
      destination,
      options.hostVersion
    )
    if (current && !current.lock) {
      throw new Error(
        `Extension ${manifestAnalysis.canonicalId} already exists as local source and cannot be overwritten by GitHub installation`
      )
    }
    if (current?.locallyModified) {
      throw new Error(
        `Extension ${manifestAnalysis.canonicalId} has local changes; restore or copy them before updating`
      )
    }
    if (
      current?.lock &&
      (current.lock.source.repository !== resolved.source.repository ||
        current.lock.source.subdirectory !== resolved.source.subdirectory)
    ) {
      throw new Error(
        `Extension ${manifestAnalysis.canonicalId} was installed from a different GitHub source location`
      )
    }

    return {
      operation: current ? "update" : "install",
      stagingRoot,
      packageRoot,
      canonicalId: manifestAnalysis.canonicalId,
      source: resolved.source,
      lock,
      inspection: candidate.inspection,
      fileCount: candidate.files.length,
      previousContentDigest: current?.inspection.contentDigest,
      previousLock: current?.lock,
      fileChanges: diffExtensionFiles(current?.files ?? [], candidate.files),
      permissionChanges: diffExtensionPermissions(
        current?.inspection.normalizedPermissions,
        candidate.inspection.normalizedPermissions
      ),
    }
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true }).catch(
      () => undefined
    )
    throw error
  }
}

async function assertRealDirectory(
  root: string,
  label: string
): Promise<string> {
  const stats = await lstat(root)
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label} must be a real directory`)
  }
  return realpath(root)
}

export async function commitPreparedExtensionInstall(
  options: CommitPreparedExtensionInstallOptions
): Promise<{ canonicalId: string; operation: "install" | "update" }> {
  const extensionsRoot = await assertRealDirectory(
    options.extensionsRoot,
    "Extensions root"
  )
  const stagingRoot = await realpath(options.prepared.stagingRoot)
  const packageRoot = await realpath(options.prepared.packageRoot)
  if (!isWithinRoot(stagingRoot, packageRoot)) {
    throw new Error("Prepared extension package escaped its staging root")
  }
  const candidate = await inspectExtensionPackageSnapshot(packageRoot, {
    hostVersion: options.hostVersion,
  })
  if (
    candidate.inspection.status !== "ready" ||
    candidate.inspection.canonicalId !== options.prepared.canonicalId ||
    candidate.inspection.contentDigest !==
      options.prepared.inspection.contentDigest ||
    candidate.inspection.permissionHash !==
      options.prepared.inspection.permissionHash
  ) {
    throw new Error("Prepared extension changed after review; prepare it again")
  }
  const candidateLock = extensionLockFromSnapshot(candidate)
  if (JSON.stringify(candidateLock) !== JSON.stringify(options.prepared.lock)) {
    throw new Error("Prepared extension provenance changed after review")
  }

  const destination = path.join(extensionsRoot, options.prepared.canonicalId)
  if (!isWithinRoot(extensionsRoot, destination)) {
    throw new Error("Extension destination escaped its root")
  }
  const current = await readExtensionInstallTarget(
    destination,
    options.hostVersion
  )
  if (options.prepared.previousContentDigest === undefined) {
    if (current)
      throw new Error("Extension destination was created after review")
  } else if (
    !current ||
    current.inspection.contentDigest !==
      options.prepared.previousContentDigest ||
    JSON.stringify(current.lock) !==
      JSON.stringify(options.prepared.previousLock) ||
    current.locallyModified
  ) {
    throw new Error(
      "Installed extension changed after review; prepare the update again"
    )
  }

  const backup = path.join(
    path.dirname(packageRoot),
    `${options.prepared.canonicalId}.backup-${randomUUID()}`
  )
  let movedCurrent = false
  try {
    if (current) {
      await rename(destination, backup)
      movedCurrent = true
    }
    await rename(packageRoot, destination)
  } catch (error) {
    if (movedCurrent) {
      await rename(backup, destination).catch(() => undefined)
    }
    throw error
  }
  if (movedCurrent) {
    await rm(backup, { recursive: true, force: true }).catch(() => undefined)
  }
  await rm(options.prepared.stagingRoot, {
    recursive: true,
    force: true,
  }).catch(() => undefined)
  return {
    canonicalId: options.prepared.canonicalId,
    operation: options.prepared.operation,
  }
}

export async function discardPreparedExtensionInstall(
  prepared: PreparedExtensionInstall
): Promise<void> {
  await rm(prepared.stagingRoot, { recursive: true, force: true })
}

export async function uninstallExtensionPackage(
  packageRoot: string,
  stagingParent: string,
  expectedContentDigest: string | undefined,
  hostVersion: string
): Promise<void> {
  let targetStats: Awaited<ReturnType<typeof lstat>>
  try {
    targetStats = await lstat(packageRoot)
  } catch (error) {
    if (isMissing(error)) {
      throw new Error("Extension package is no longer installed")
    }
    throw error
  }
  if (targetStats.isSymbolicLink() || !targetStats.isDirectory()) {
    if (expectedContentDigest !== undefined) {
      throw new Error(
        "Extension changed after review; inspect it before uninstalling"
      )
    }
    const canonicalStaging = await assertRealDirectory(
      stagingParent,
      "Extension staging root"
    )
    const quarantine = path.join(
      canonicalStaging,
      `invalid-entry.uninstall-${randomUUID()}`
    )
    await rename(packageRoot, quarantine)
    await rm(quarantine, { recursive: true, force: true }).catch(
      () => undefined
    )
    return
  }
  const current = await readExtensionInstallTarget(packageRoot, hostVersion)
  if (!current || current.inspection.contentDigest !== expectedContentDigest) {
    throw new Error(
      "Extension changed after review; inspect it before uninstalling"
    )
  }
  const canonicalStaging = await assertRealDirectory(
    stagingParent,
    "Extension staging root"
  )
  const quarantine = path.join(
    canonicalStaging,
    `${current.inspection.canonicalId ?? "extension"}.uninstall-${randomUUID()}`
  )
  await rename(packageRoot, quarantine)
  await rm(quarantine, { recursive: true, force: true }).catch(() => undefined)
}
