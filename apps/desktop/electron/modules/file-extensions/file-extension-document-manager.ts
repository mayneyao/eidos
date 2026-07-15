import { randomUUID } from "node:crypto"
import {
  SPACE_FILE_PREVIEW_MAX_BYTES,
  SpaceFiles,
  SpaceFilesError,
} from "@eidos.space/file-space"
import {
  EXTENSION_SURFACE_MAX_TEXT_CODE_UNITS,
  ExtensionSurfaceProtocolError,
  ExtensionTextDocumentError,
  ExtensionTextDocumentModel,
  parseExtensionSurfaceMessage,
  type ExtensionHostToSurfaceMessage,
  type ExtensionSurfaceRequestFailure,
  type ExtensionSurfaceRequestSuccess,
} from "@eidos.space/extension-surface-protocol"

import { Inject, Injectable } from "../../common/di"
import { withFileSpaceOperationLock } from "../space-management/file-space-operation-lock"
import { MainWindowProvider } from "../space-management/main-window.provider"
import type {
  FileExtensionOpenEditorResult,
  FileExtensionSurfaceMessageEvent,
  FileExtensionSurfaceRequestResult,
} from "./types"

const DEFAULT_AUTO_SAVE_DELAY_MS = 700

export interface OpenFileExtensionDocumentOptions {
  spaceId: string
  spacePath: string
  packageId: string
  editorId: string
  generation: string
  source: string
  path: string
  mediaType: string
  languageId?: string
  editable: boolean
}

interface FileExtensionDocumentSession {
  key: string
  sessionId: string
  spaceId: string
  packageId: string
  editorId: string
  generation: string
  source: string
  path: string
  files: SpaceFiles
  model: ExtensionTextDocumentModel
  views: Set<string>
  autoSaveTimer?: ReturnType<typeof setTimeout>
  savePromise?: Promise<void>
  requestedSaveRevision: number
  suspended: boolean
  disposed: boolean
}

function requestIdFromUnknown(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "requestId" in value &&
    typeof value.requestId === "string" &&
    value.requestId.length > 0 &&
    value.requestId.length <= 128
  ) {
    return value.requestId
  }
  return `invalid-${randomUUID()}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

@Injectable()
export class FileExtensionDocumentManager {
  private readonly sessions = new Map<string, FileExtensionDocumentSession>()
  private readonly sessionIds = new Map<string, FileExtensionDocumentSession>()

  constructor(
    @Inject(MainWindowProvider)
    private readonly windowProvider: MainWindowProvider
  ) {}

  async open(
    options: OpenFileExtensionDocumentOptions
  ): Promise<FileExtensionOpenEditorResult> {
    const key = this.sessionKey(options)
    let session = this.sessions.get(key)
    if (session && session.generation !== options.generation) {
      this.disposeSession(session, "Extension package generation changed")
      session = undefined
    }
    if (!session) {
      const files = new SpaceFiles(options.spacePath)
      const file = await files.readText(
        options.path,
        SPACE_FILE_PREVIEW_MAX_BYTES
      )
      if (
        file.size > SPACE_FILE_PREVIEW_MAX_BYTES ||
        file.content.length > EXTENSION_SURFACE_MAX_TEXT_CODE_UNITS
      ) {
        throw new Error(
          `Extension text editors support files up to ${SPACE_FILE_PREVIEW_MAX_BYTES} bytes and ${EXTENSION_SURFACE_MAX_TEXT_CODE_UNITS} UTF-16 code units`
        )
      }
      session = {
        key,
        sessionId: randomUUID(),
        spaceId: options.spaceId,
        packageId: options.packageId,
        editorId: options.editorId,
        generation: options.generation,
        source: options.source,
        path: file.path,
        files,
        model: new ExtensionTextDocumentModel({
          documentId: randomUUID(),
          resource: {
            path: file.path,
            mediaType: options.mediaType,
            languageId: options.languageId,
            encoding: "utf-8",
          },
          text: file.content,
          persistedContentDigest: file.contentDigest,
          readOnly: !options.editable,
        }),
        views: new Set(),
        requestedSaveRevision: 0,
        suspended: false,
        disposed: false,
      }
      this.sessions.set(key, session)
      this.sessionIds.set(session.sessionId, session)
    }

    const viewId = randomUUID()
    session.views.add(viewId)
    const snapshot = session.model.getSnapshot()
    return {
      sessionId: session.sessionId,
      viewId,
      packageId: session.packageId,
      editorId: session.editorId,
      generation: session.generation,
      source: session.source,
      snapshot,
      capabilities: {
        editable: !snapshot.readOnly,
        save: !snapshot.readOnly,
        undoRedo: !snapshot.readOnly,
        savePolicy: snapshot.readOnly
          ? { mode: "off" }
          : { mode: "afterDelay", delayMs: DEFAULT_AUTO_SAVE_DELAY_MS },
      },
    }
  }

  async handleRequest(
    spaceId: string,
    sessionId: string,
    viewId: string,
    value: unknown
  ): Promise<FileExtensionSurfaceRequestResult> {
    const session = this.requireView(spaceId, sessionId, viewId)
    let message
    try {
      message = parseExtensionSurfaceMessage(value)
    } catch (error) {
      return this.failure(
        session,
        requestIdFromUnknown(value),
        "PROTOCOL_ERROR",
        errorMessage(error)
      )
    }
    if (
      message.type === "ready" ||
      message.type === "activated" ||
      message.type === "activation-error" ||
      message.type === "closed"
    ) {
      return this.failure(
        session,
        requestIdFromUnknown(value),
        "PROTOCOL_ERROR",
        `Surface message ${message.type} is not a document request`
      )
    }

    try {
      if (message.type === "apply-edits") {
        const changed = session.model.applyEdits(
          viewId,
          message.documentId,
          message.baseRevision,
          message.edits
        )
        this.broadcast(session, changed)
        this.scheduleAutoSave(session)
      } else if (message.type === "request-undo") {
        const changed = session.model.undo(
          viewId,
          message.documentId,
          message.baseRevision
        )
        this.broadcast(session, changed)
        this.scheduleAutoSave(session)
      } else if (message.type === "request-redo") {
        const changed = session.model.redo(
          viewId,
          message.documentId,
          message.baseRevision
        )
        this.broadcast(session, changed)
        this.scheduleAutoSave(session)
      } else if (message.type === "request-resync") {
        const snapshot = session.model.getSnapshot()
        if (message.documentId !== snapshot.documentId) {
          throw new ExtensionTextDocumentError(
            "DOCUMENT_MISMATCH",
            "Document request targets another document"
          )
        }
        this.send(session, viewId, session.model.resync())
      } else {
        const snapshot = session.model.getSnapshot()
        if (message.documentId !== snapshot.documentId) {
          throw new ExtensionTextDocumentError(
            "DOCUMENT_MISMATCH",
            "Document request targets another document"
          )
        }
        if (message.baseRevision !== snapshot.revision) {
          throw new ExtensionTextDocumentError(
            "STALE_REVISION",
            `Expected document revision ${snapshot.revision}, received ${message.baseRevision}`
          )
        }
        await this.save(session, message.baseRevision)
      }
      return this.success(session, message.requestId)
    } catch (error) {
      if (error instanceof ExtensionTextDocumentError) {
        return this.failure(
          session,
          message.requestId,
          error.code,
          error.message
        )
      }
      if (error instanceof ExtensionSurfaceProtocolError) {
        return this.failure(
          session,
          message.requestId,
          "PROTOCOL_ERROR",
          error.message
        )
      }
      return this.failure(
        session,
        message.requestId,
        "NOT_AVAILABLE",
        errorMessage(error)
      )
    }
  }

  async flush(
    spaceId: string,
    sessionId: string,
    viewId: string
  ): Promise<{ success: true }> {
    const session = this.requireView(spaceId, sessionId, viewId)
    this.clearAutoSave(session)
    const snapshot = session.model.getSnapshot()
    if (snapshot.dirty && !snapshot.readOnly) {
      await this.save(session, snapshot.revision)
    }
    return { success: true }
  }

  async refresh(
    spaceId: string,
    sessionId: string,
    viewId: string
  ): Promise<{ success: true }> {
    const session = this.requireView(spaceId, sessionId, viewId)
    await this.refreshSession(session)
    return { success: true }
  }

  async resolveConflict(
    spaceId: string,
    sessionId: string,
    viewId: string,
    resolution: "reload" | "overwrite"
  ): Promise<{ success: true }> {
    const session = this.requireView(spaceId, sessionId, viewId)
    const message = session.model.resolveExternalConflict(resolution)
    this.broadcast(session, message)
    if (resolution === "overwrite") this.scheduleAutoSave(session, 0)
    return { success: true }
  }

  async close(
    spaceId: string,
    sessionId: string,
    viewId: string
  ): Promise<{ success: true }> {
    if (!this.sessionIds.has(sessionId)) return { success: true }

    const session = this.requireView(spaceId, sessionId, viewId)
    if (session.views.size === 1) {
      this.clearAutoSave(session)
      const snapshot = session.model.getSnapshot()
      if (snapshot.dirty && snapshot.externalConflict) {
        throw new ExtensionTextDocumentError(
          "CONFLICT",
          "Resolve the external file conflict before closing the editor"
        )
      }
      if (snapshot.dirty && !snapshot.readOnly && !snapshot.externalConflict) {
        await this.save(session, snapshot.revision)
      }
      session.views.delete(viewId)
      this.disposeSession(session, "Last editor view closed", false)
    } else {
      session.views.delete(viewId)
    }
    return { success: true }
  }

  async flushPackage(spaceId: string, packageId: string): Promise<void> {
    await this.flushSessions(
      (session) =>
        session.spaceId === spaceId && session.packageId === packageId
    )
  }

  async flushSpace(spaceId: string): Promise<void> {
    await this.flushSessions((session) => session.spaceId === spaceId)
  }

  async flushAndDisposePackage(
    spaceId: string,
    packageId: string,
    reason: string
  ): Promise<void> {
    await this.flushAndDisposeSessions(
      (session) =>
        session.spaceId === spaceId && session.packageId === packageId,
      reason
    )
  }

  async flushAndDisposeSpace(spaceId: string, reason: string): Promise<void> {
    await this.flushAndDisposeSessions(
      (session) => session.spaceId === spaceId,
      reason
    )
  }

  disposePackage(spaceId: string, packageId: string, reason: string): void {
    for (const session of [...this.sessions.values()]) {
      if (session.spaceId === spaceId && session.packageId === packageId) {
        this.disposeSession(session, reason)
      }
    }
  }

  disposeSpace(spaceId: string, reason: string): void {
    for (const session of [...this.sessions.values()]) {
      if (session.spaceId === spaceId) this.disposeSession(session, reason)
    }
  }

  private async flushSessions(
    matches: (session: FileExtensionDocumentSession) => boolean
  ): Promise<void> {
    await Promise.all(
      [...this.sessions.values()].filter(matches).map(async (session) => {
        this.clearAutoSave(session)
        const snapshot = session.model.getSnapshot()
        if (snapshot.dirty && !snapshot.readOnly) {
          await this.save(session, snapshot.revision)
        }
      })
    )
  }

  private async flushAndDisposeSessions(
    matches: (session: FileExtensionDocumentSession) => boolean,
    reason: string
  ): Promise<void> {
    const sessions = [...this.sessions.values()].filter(matches)
    for (const session of sessions) session.suspended = true
    const results = await Promise.allSettled(
      sessions.map(async (session) => {
        this.clearAutoSave(session)
        const snapshot = session.model.getSnapshot()
        if (snapshot.dirty && snapshot.externalConflict) {
          throw new ExtensionTextDocumentError(
            "CONFLICT",
            `Cannot reload ${session.path} while it has an external conflict`
          )
        }
        if (snapshot.dirty && !snapshot.readOnly) {
          await this.save(session, snapshot.revision)
        }
      })
    )
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        this.disposeSession(sessions[index]!, reason)
      } else {
        sessions[index]!.suspended = false
      }
    })
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    )
    if (failure) throw failure.reason
  }

  private scheduleAutoSave(
    session: FileExtensionDocumentSession,
    delayMs = DEFAULT_AUTO_SAVE_DELAY_MS
  ): void {
    if (session.model.getSnapshot().readOnly || session.disposed) return
    this.clearAutoSave(session)
    session.autoSaveTimer = setTimeout(() => {
      session.autoSaveTimer = undefined
      const snapshot = session.model.getSnapshot()
      if (!snapshot.dirty || snapshot.externalConflict) return
      void this.save(session, snapshot.revision).catch(() => undefined)
    }, delayMs)
  }

  private clearAutoSave(session: FileExtensionDocumentSession): void {
    if (!session.autoSaveTimer) return
    clearTimeout(session.autoSaveTimer)
    session.autoSaveTimer = undefined
  }

  private async save(
    session: FileExtensionDocumentSession,
    targetRevision: number
  ): Promise<void> {
    if (session.disposed) {
      throw new ExtensionTextDocumentError(
        "RUNTIME_STALE",
        "Extension editor session is disposed"
      )
    }
    session.requestedSaveRevision = Math.max(
      session.requestedSaveRevision,
      targetRevision
    )
    if (!session.savePromise) {
      const promise = this.runSaveLoop(session)
      session.savePromise = promise
      void promise.then(
        () => {
          if (session.savePromise === promise) session.savePromise = undefined
        },
        () => {
          if (session.savePromise === promise) session.savePromise = undefined
        }
      )
    }
    await session.savePromise
  }

  private async runSaveLoop(
    session: FileExtensionDocumentSession
  ): Promise<void> {
    while (!session.disposed) {
      const snapshot = session.model.getSnapshot()
      if (
        !snapshot.dirty ||
        snapshot.savedRevision >= session.requestedSaveRevision
      ) {
        return
      }
      const token = session.model.beginSave(
        snapshot.documentId,
        snapshot.revision
      )
      this.broadcast(session, {
        type: "save-state",
        documentId: snapshot.documentId,
        revision: token.revision,
        state: "saving",
      })
      try {
        const file = await withFileSpaceOperationLock(session.spaceId, () =>
          session.files.writeText(
            session.path,
            token.text,
            undefined,
            token.expectedPersistedContentDigest
          )
        )
        const state = session.model.completeSave(token, file.contentDigest)
        this.broadcast(session, state)
        this.broadcast(session, {
          type: "save-state",
          documentId: snapshot.documentId,
          revision: token.revision,
          state: "saved",
        })
      } catch (error) {
        try {
          session.model.cancelSave(token)
        } catch {
          // completeSave already consumed the token.
        }
        if (error instanceof SpaceFilesError && error.code === "file-changed") {
          await this.refreshSession(session, true)
        }
        const message = errorMessage(error)
        this.broadcast(session, {
          type: "save-state",
          documentId: snapshot.documentId,
          revision: token.revision,
          state: "error",
          message,
        })
        throw new ExtensionTextDocumentError(
          error instanceof SpaceFilesError && error.code === "file-changed"
            ? "CONFLICT"
            : "SAVE_FAILED",
          message
        )
      }
    }
  }

  private async refreshSession(
    session: FileExtensionDocumentSession,
    skipPendingSave = false
  ): Promise<void> {
    if (!skipPendingSave && session.savePromise) {
      await session.savePromise.catch(() => undefined)
    }
    const file = await session.files.readText(
      session.path,
      SPACE_FILE_PREVIEW_MAX_BYTES
    )
    const message = session.model.observeExternalSnapshot({
      text: file.content,
      contentDigest: file.contentDigest,
      size: file.size,
      mtimeMs: file.mtimeMs,
    })
    if (message) this.broadcast(session, message)
  }

  private success(
    session: FileExtensionDocumentSession,
    requestId: string
  ): ExtensionSurfaceRequestSuccess {
    return {
      type: "request-result",
      requestId,
      ok: true,
      revision: session.model.getSnapshot().revision,
    }
  }

  private failure(
    session: FileExtensionDocumentSession,
    requestId: string,
    code: ExtensionSurfaceRequestFailure["error"]["code"],
    message: string
  ): ExtensionSurfaceRequestFailure {
    return {
      type: "request-result",
      requestId,
      ok: false,
      revision: session.model.getSnapshot().revision,
      error: { code, message },
    }
  }

  private broadcast(
    session: FileExtensionDocumentSession,
    message: ExtensionHostToSurfaceMessage
  ): void {
    for (const viewId of session.views) this.send(session, viewId, message)
  }

  private send(
    session: FileExtensionDocumentSession,
    viewId: string,
    message: ExtensionHostToSurfaceMessage
  ): void {
    const event: FileExtensionSurfaceMessageEvent = {
      spaceId: session.spaceId,
      sessionId: session.sessionId,
      viewId,
      message,
    }
    this.windowProvider
      .getWindow()
      ?.webContents.send("file-extensions:surface-message", event)
  }

  private requireView(
    spaceId: string,
    sessionId: string,
    viewId: string
  ): FileExtensionDocumentSession {
    const session = this.sessionIds.get(sessionId)
    if (
      !session ||
      session.disposed ||
      session.suspended ||
      session.spaceId !== spaceId ||
      !session.views.has(viewId)
    ) {
      throw new ExtensionTextDocumentError(
        "RUNTIME_STALE",
        "Extension editor session is unavailable"
      )
    }
    return session
  }

  private disposeSession(
    session: FileExtensionDocumentSession,
    reason: string,
    notify = true
  ): void {
    if (session.disposed) return
    session.disposed = true
    this.clearAutoSave(session)
    if (notify) {
      this.broadcast(session, { type: "dispose", reason })
    }
    session.views.clear()
    this.sessions.delete(session.key)
    this.sessionIds.delete(session.sessionId)
  }

  private sessionKey(options: OpenFileExtensionDocumentOptions): string {
    return [
      options.spaceId,
      options.packageId,
      options.editorId,
      options.path,
    ].join("\0")
  }
}
