import { randomUUID } from "node:crypto"
import path from "node:path"
import { canonicalExtensionPackagePath } from "@eidos.space/extension-manifest"
import {
  commitPreparedExtensionInstall,
  discardPreparedExtensionInstall,
  prepareGitHubExtensionInstall,
  uninstallExtensionPackage,
} from "@eidos.space/extension-installer/node"
import type { PreparedExtensionInstall } from "@eidos.space/extension-installer"

import { Injectable } from "../../common/di"
import {
  ensureExtensionStagingRoot,
  resolveExtensionProjectPaths,
  type ExtensionProjectPaths,
} from "./extension-paths"
import type {
  FileExtensionApplyInstallRequest,
  FileExtensionGitHubInstallRequest,
  FileExtensionInstallPreview,
  FileExtensionInstallResult,
  FileExtensionUninstallRequest,
} from "./types"

const PREVIEW_TTL_MS = 10 * 60_000
const MAX_PREVIEW_SESSIONS = 8

interface InstallPreviewSession {
  id: string
  spaceId: string
  expiresAt: number
  prepared: PreparedExtensionInstall
  timer: ReturnType<typeof setTimeout>
}

function completePaths(
  paths: ExtensionProjectPaths
): asserts paths is Required<ExtensionProjectPaths> {
  if (!paths.eidosRoot || !paths.extensionsRoot || !paths.extensionsIdentity) {
    throw new Error("Unable to prepare the extension project directory")
  }
}

function requestId(): string {
  return randomUUID()
}

@Injectable()
export class FileExtensionInstallManager {
  private readonly sessions = new Map<string, InstallPreviewSession>()

  async prepare(
    spaceId: string,
    spacePath: string,
    request: FileExtensionGitHubInstallRequest,
    hostVersion: string
  ): Promise<FileExtensionInstallPreview> {
    await this.expireSessions()
    const paths = await resolveExtensionProjectPaths(spacePath, true)
    completePaths(paths)
    const stagingParent = await ensureExtensionStagingRoot(paths)
    const prepared = await prepareGitHubExtensionInstall({
      request,
      stagingParent,
      extensionsRoot: paths.extensionsRoot,
      hostVersion,
    })
    const id = requestId()
    const expiresAt = Date.now() + PREVIEW_TTL_MS
    const timer = setTimeout(() => {
      const session = this.sessions.get(id)
      if (session) void this.disposeSession(session)
    }, PREVIEW_TTL_MS)
    timer.unref?.()
    this.sessions.set(id, { id, spaceId, expiresAt, prepared, timer })
    await this.trimSessions()
    return this.toPreview(id, expiresAt, prepared)
  }

  async apply(
    spaceId: string,
    spacePath: string,
    request: FileExtensionApplyInstallRequest,
    hostVersion: string
  ): Promise<FileExtensionInstallResult> {
    const session = this.requireSession(spaceId, request.previewId)
    if (
      session.prepared.inspection.contentDigest !== request.contentDigest ||
      session.prepared.inspection.permissionHash !== request.permissionHash
    ) {
      throw new Error("Extension install preview changed; prepare it again")
    }

    // Claim the reviewed snapshot before the first async boundary. Otherwise a
    // concurrent apply or cancel can observe the same session and either
    // commit it twice or discard its staging directory while it is installing.
    this.sessions.delete(session.id)
    clearTimeout(session.timer)
    try {
      const paths = await resolveExtensionProjectPaths(spacePath)
      if (!paths.extensionsRoot) {
        throw new Error("Extension project directory is no longer available")
      }
      const result = await commitPreparedExtensionInstall({
        prepared: session.prepared,
        extensionsRoot: paths.extensionsRoot,
        hostVersion,
      })
      return {
        ...result,
        root: `.eidos/extensions/${result.canonicalId}`,
        contentDigest: request.contentDigest,
        permissionHash: request.permissionHash,
      }
    } catch (error) {
      await discardPreparedExtensionInstall(session.prepared).catch(
        () => undefined
      )
      throw error
    }
  }

  async cancel(spaceId: string, previewId: string): Promise<void> {
    const session = this.sessions.get(previewId)
    if (!session) return
    if (session.spaceId !== spaceId) {
      throw new Error("Extension install preview belongs to another Space")
    }
    await this.disposeSession(session)
  }

  async uninstall(
    spacePath: string,
    request: FileExtensionUninstallRequest,
    hostVersion: string
  ): Promise<void> {
    const paths = await resolveExtensionProjectPaths(spacePath)
    if (!paths.extensionsRoot || !paths.eidosRoot) {
      throw new Error("Extension package is no longer installed")
    }
    completePaths(paths)
    const directoryName = canonicalExtensionPackagePath(request.directoryName)
    if (directoryName.includes("/")) {
      throw new Error(
        "Extension package directory name must be one path segment"
      )
    }
    const packageRoot = path.join(paths.extensionsRoot, directoryName)
    const stagingParent = await ensureExtensionStagingRoot(paths)
    await uninstallExtensionPackage(
      packageRoot,
      stagingParent,
      request.contentDigest,
      hostVersion
    )
  }

  private requireSession(
    spaceId: string,
    previewId: string
  ): InstallPreviewSession {
    if (typeof previewId !== "string" || !previewId) {
      throw new Error("An extension install preview ID is required")
    }
    const session = this.sessions.get(previewId)
    if (!session || session.expiresAt <= Date.now()) {
      if (session) {
        void this.disposeSession(session)
      }
      throw new Error("Extension install preview expired; prepare it again")
    }
    if (session.spaceId !== spaceId) {
      throw new Error("Extension install preview belongs to another Space")
    }
    return session
  }

  private toPreview(
    id: string,
    expiresAt: number,
    prepared: PreparedExtensionInstall
  ): FileExtensionInstallPreview {
    const manifest = prepared.inspection.manifest!
    return {
      previewId: id,
      expiresAt,
      operation: prepared.operation,
      canonicalId: prepared.canonicalId,
      displayName: manifest.displayName,
      description: manifest.description,
      version: manifest.version,
      source: prepared.source,
      contentDigest: prepared.inspection.contentDigest!,
      permissionHash: prepared.inspection.permissionHash!,
      fileCount: prepared.fileCount,
      fileChanges: prepared.fileChanges,
      permissionChanges: prepared.permissionChanges,
    }
  }

  private async expireSessions(): Promise<void> {
    const expired = [...this.sessions.values()].filter(
      (session) => session.expiresAt <= Date.now()
    )
    await Promise.all(
      expired.map(async (session) => {
        await this.disposeSession(session)
      })
    )
  }

  private async trimSessions(): Promise<void> {
    const overflow = [...this.sessions.values()]
      .sort((left, right) => left.expiresAt - right.expiresAt)
      .slice(0, Math.max(0, this.sessions.size - MAX_PREVIEW_SESSIONS))
    await Promise.all(
      overflow.map(async (session) => {
        await this.disposeSession(session)
      })
    )
  }

  private async disposeSession(session: InstallPreviewSession): Promise<void> {
    if (this.sessions.get(session.id) !== session) return
    this.sessions.delete(session.id)
    clearTimeout(session.timer)
    await discardPreparedExtensionInstall(session.prepared).catch(
      () => undefined
    )
  }
}
