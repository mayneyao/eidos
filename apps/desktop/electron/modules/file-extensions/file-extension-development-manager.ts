import { randomUUID } from "node:crypto"

import {
  normalizeExtensionPermissionGrants,
  type ExtensionPermissionGrant,
  type ExtensionSnapshotIdentity,
} from "@eidos.space/extension-state"

import { Injectable } from "../../common/di"
import type {
  FileExtensionDevelopmentDiagnostic,
  FileExtensionDevelopmentSessionSummary,
  FileExtensionDevelopmentStatus,
} from "./types"

interface FileExtensionDevelopmentSession extends FileExtensionDevelopmentSessionSummary {
  directoryName: string
  requestedGrants: ExtensionPermissionGrant[]
}

export interface FileExtensionDevelopmentAuthorization {
  requestedGrants: ExtensionPermissionGrant[]
  granted: ExtensionPermissionGrant[]
}

function sessionKey(spaceId: string, packageId: string): string {
  return `${spaceId}\0${packageId}`
}

function sameSnapshot(
  left: ExtensionSnapshotIdentity | undefined,
  right: ExtensionSnapshotIdentity
): boolean {
  return (
    left?.packageId === right.packageId &&
    left.contentDigest === right.contentDigest &&
    left.permissionHash === right.permissionHash
  )
}

function cloneSnapshot(
  snapshot: ExtensionSnapshotIdentity
): ExtensionSnapshotIdentity {
  return { ...snapshot }
}

function cloneDiagnostic(
  diagnostic: FileExtensionDevelopmentDiagnostic
): FileExtensionDevelopmentDiagnostic {
  return { ...diagnostic }
}

function sameDiagnostics(
  left: readonly FileExtensionDevelopmentDiagnostic[],
  right: readonly FileExtensionDevelopmentDiagnostic[]
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (diagnostic, index) =>
        diagnostic.code === right[index]?.code &&
        diagnostic.message === right[index]?.message &&
        diagnostic.path === right[index]?.path
    )
  )
}

@Injectable()
export class FileExtensionDevelopmentManager {
  private readonly sessions = new Map<string, FileExtensionDevelopmentSession>()

  start(options: {
    spaceId: string
    directoryName: string
    snapshot: ExtensionSnapshotIdentity
    requestedGrants: readonly ExtensionPermissionGrant[]
    granted: readonly ExtensionPermissionGrant[]
    now?: number
  }): FileExtensionDevelopmentSessionSummary {
    const key = sessionKey(options.spaceId, options.snapshot.packageId)
    const existing = this.sessions.get(key)
    if (existing && sameSnapshot(existing.anchorSnapshot, options.snapshot)) {
      return this.summary(existing)
    }
    if (existing) {
      throw new Error(
        "Stop the current extension development session before changing its anchor snapshot"
      )
    }
    const session: FileExtensionDevelopmentSession = {
      sessionId: randomUUID(),
      packageId: options.snapshot.packageId,
      directoryName: options.directoryName,
      anchorSnapshot: cloneSnapshot(options.snapshot),
      currentSnapshot: cloneSnapshot(options.snapshot),
      requestedGrants: normalizeExtensionPermissionGrants(
        options.requestedGrants
      ),
      granted: normalizeExtensionPermissionGrants(options.granted),
      status: "ready",
      diagnostics: [],
      startedAt: options.now ?? Date.now(),
      generation: 1,
    }
    this.sessions.set(key, session)
    return this.summary(session)
  }

  get(
    spaceId: string,
    packageId: string
  ): FileExtensionDevelopmentSessionSummary | undefined {
    const session = this.sessions.get(sessionKey(spaceId, packageId))
    return session ? this.summary(session) : undefined
  }

  getByDirectory(
    spaceId: string,
    directoryName: string
  ): FileExtensionDevelopmentSessionSummary | undefined {
    const session = this.findByDirectory(spaceId, directoryName)
    return session ? this.summary(session) : undefined
  }

  list(spaceId: string): FileExtensionDevelopmentSessionSummary[] {
    return [...this.sessions.entries()]
      .filter(([key]) => key.startsWith(`${spaceId}\0`))
      .map(([, session]) => this.summary(session))
  }

  directoryName(spaceId: string, packageId: string): string | undefined {
    return this.sessions.get(sessionKey(spaceId, packageId))?.directoryName
  }

  markChecking(
    spaceId: string,
    packageId: string
  ): FileExtensionDevelopmentSessionSummary | undefined {
    const session = this.sessions.get(sessionKey(spaceId, packageId))
    if (!session) return undefined
    session.status = "checking"
    session.currentSnapshot = undefined
    session.diagnostics = []
    session.generation += 1
    return this.summary(session)
  }

  markReady(
    spaceId: string,
    packageId: string,
    snapshot: ExtensionSnapshotIdentity
  ): FileExtensionDevelopmentSessionSummary | undefined {
    const session = this.sessions.get(sessionKey(spaceId, packageId))
    if (!session) return undefined
    if (
      snapshot.packageId !== session.packageId ||
      snapshot.permissionHash !== session.anchorSnapshot.permissionHash
    ) {
      return this.transition(
        spaceId,
        packageId,
        "permissions-changed",
        snapshot,
        [
          {
            code: "inspection",
            message:
              "The extension ID or requested permissions changed. Stop the development session and review the new source before running it.",
          },
        ]
      )
    }
    return this.transition(spaceId, packageId, "ready", snapshot, [])
  }

  markBlocked(
    spaceId: string,
    packageId: string,
    status: Exclude<FileExtensionDevelopmentStatus, "checking" | "ready">,
    diagnostics: readonly FileExtensionDevelopmentDiagnostic[],
    snapshot?: ExtensionSnapshotIdentity
  ): FileExtensionDevelopmentSessionSummary | undefined {
    return this.transition(spaceId, packageId, status, snapshot, diagnostics)
  }

  authorize(
    spaceId: string,
    snapshot: ExtensionSnapshotIdentity
  ): FileExtensionDevelopmentAuthorization | undefined {
    const session = this.sessions.get(sessionKey(spaceId, snapshot.packageId))
    if (
      !session ||
      session.status !== "ready" ||
      !sameSnapshot(session.currentSnapshot, snapshot) ||
      snapshot.permissionHash !== session.anchorSnapshot.permissionHash
    ) {
      return undefined
    }
    return {
      requestedGrants: session.requestedGrants.map((grant) => ({ ...grant })),
      granted: session.granted.map((grant) => ({ ...grant })),
    }
  }

  stop(
    spaceId: string,
    packageId: string,
    sessionId?: string
  ): FileExtensionDevelopmentSessionSummary | undefined {
    const key = sessionKey(spaceId, packageId)
    const session = this.sessions.get(key)
    if (!session) return undefined
    if (sessionId && session.sessionId !== sessionId) {
      throw new Error("Development session changed; refresh before stopping it")
    }
    this.sessions.delete(key)
    return this.summary(session)
  }

  stopSpace(spaceId: string): FileExtensionDevelopmentSessionSummary[] {
    const stopped = this.list(spaceId)
    for (const session of stopped) {
      this.sessions.delete(sessionKey(spaceId, session.packageId))
    }
    return stopped
  }

  stopAll(): void {
    this.sessions.clear()
  }

  private transition(
    spaceId: string,
    packageId: string,
    status: FileExtensionDevelopmentStatus,
    snapshot: ExtensionSnapshotIdentity | undefined,
    diagnostics: readonly FileExtensionDevelopmentDiagnostic[]
  ): FileExtensionDevelopmentSessionSummary | undefined {
    const session = this.sessions.get(sessionKey(spaceId, packageId))
    if (!session) return undefined
    if (
      session.status === status &&
      (snapshot
        ? sameSnapshot(session.currentSnapshot, snapshot)
        : session.currentSnapshot === undefined) &&
      sameDiagnostics(session.diagnostics, diagnostics)
    ) {
      return this.summary(session)
    }
    session.status = status
    session.currentSnapshot = snapshot ? cloneSnapshot(snapshot) : undefined
    session.diagnostics = diagnostics.map(cloneDiagnostic)
    session.generation += 1
    return this.summary(session)
  }

  private findByDirectory(
    spaceId: string,
    directoryName: string
  ): FileExtensionDevelopmentSession | undefined {
    for (const [key, session] of this.sessions) {
      if (
        key.startsWith(`${spaceId}\0`) &&
        session.directoryName === directoryName
      ) {
        return session
      }
    }
    return undefined
  }

  private summary(
    session: FileExtensionDevelopmentSession
  ): FileExtensionDevelopmentSessionSummary {
    return {
      sessionId: session.sessionId,
      packageId: session.packageId,
      anchorSnapshot: cloneSnapshot(session.anchorSnapshot),
      currentSnapshot: session.currentSnapshot
        ? cloneSnapshot(session.currentSnapshot)
        : undefined,
      status: session.status,
      diagnostics: session.diagnostics.map(cloneDiagnostic),
      granted: session.granted.map((grant) => ({ ...grant })),
      startedAt: session.startedAt,
      generation: session.generation,
    }
  }
}
