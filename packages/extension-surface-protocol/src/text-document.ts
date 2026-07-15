import {
  applyExtensionTextEdits,
  EXTENSION_SURFACE_MAX_TEXT_CODE_UNITS,
  ExtensionSurfaceProtocolError,
  invertExtensionTextEdits,
  validateExtensionTextEdits,
} from "./protocol"
import type {
  ExtensionExternalDocumentSnapshot,
  ExtensionSurfaceRequestErrorCode,
  ExtensionTextDocumentChangedMessage,
  ExtensionTextDocumentReplacedMessage,
  ExtensionTextDocumentResource,
  ExtensionTextDocumentSaveToken,
  ExtensionTextDocumentSnapshot,
  ExtensionTextDocumentState,
  ExtensionTextDocumentStateMessage,
  ExtensionTextEdit,
} from "./types"

const DEFAULT_MAX_HISTORY_ENTRIES = 100
const DEFAULT_MAX_HISTORY_CODE_UNITS = 4 * 1024 * 1024
const DEFAULT_MAX_PENDING_SAVES = 4

interface HistoryEntry {
  forward: ExtensionTextEdit[]
  inverse: ExtensionTextEdit[]
  codeUnits: number
}

interface PendingExternalSnapshot {
  public: ExtensionExternalDocumentSnapshot
}

export interface ExtensionTextDocumentModelOptions {
  documentId: string
  resource: ExtensionTextDocumentResource
  text: string
  persistedContentDigest: string
  readOnly?: boolean
  maxTextCodeUnits?: number
  maxHistoryEntries?: number
  maxHistoryCodeUnits?: number
  maxPendingSaves?: number
}

export class ExtensionTextDocumentError extends Error {
  constructor(
    readonly code: ExtensionSurfaceRequestErrorCode,
    message: string
  ) {
    super(message)
    this.name = "ExtensionTextDocumentError"
  }
}

function requiredText(value: string, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value || value.length > maxLength) {
    throw new ExtensionTextDocumentError(
      "PROTOCOL_ERROR",
      `${label} must be a non-empty string no longer than ${maxLength} characters`
    )
  }
  return value
}

function boundedInteger(
  value: number,
  label: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ExtensionTextDocumentError(
      "PROTOCOL_ERROR",
      `${label} must be a safe integer between ${minimum} and ${maximum}`
    )
  }
  return value
}

function sameSaveToken(
  left: ExtensionTextDocumentSaveToken,
  right: ExtensionTextDocumentSaveToken
): boolean {
  return (
    left.tokenId === right.tokenId &&
    left.documentId === right.documentId &&
    left.revision === right.revision &&
    left.text === right.text &&
    left.expectedPersistedContentDigest === right.expectedPersistedContentDigest
  )
}

function copyEdits(edits: readonly ExtensionTextEdit[]): ExtensionTextEdit[] {
  return edits.map((edit) => ({ ...edit }))
}

function editCodeUnits(
  forward: readonly ExtensionTextEdit[],
  inverse: readonly ExtensionTextEdit[]
): number {
  return [...forward, ...inverse].reduce(
    (total, edit) => total + edit.text.length + (edit.end - edit.start),
    0
  )
}

export class ExtensionTextDocumentModel {
  private readonly documentId: string
  private readonly resource: ExtensionTextDocumentResource
  private readonly maxTextCodeUnits: number
  private readonly maxHistoryEntries: number
  private readonly maxHistoryCodeUnits: number
  private readonly maxPendingSaves: number
  private text: string
  private savedText: string
  private revision = 1
  private savedRevision = 1
  private persistedContentDigest: string
  private readOnly: boolean
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  private undoCodeUnits = 0
  private pendingExternal?: PendingExternalSnapshot
  private saveSequence = 0
  private pendingSaves = new Map<string, ExtensionTextDocumentSaveToken>()

  constructor(options: ExtensionTextDocumentModelOptions) {
    this.documentId = requiredText(options.documentId, "Document ID", 256)
    this.resource = {
      path: requiredText(options.resource.path, "Document path", 4096),
      mediaType: requiredText(
        options.resource.mediaType,
        "Document media type",
        256
      ),
      languageId: options.resource.languageId
        ? requiredText(options.resource.languageId, "Language ID", 128)
        : undefined,
      encoding: "utf-8",
    }
    if (options.resource.encoding !== "utf-8") {
      throw new ExtensionTextDocumentError(
        "PROTOCOL_ERROR",
        "Version 1 text documents require UTF-8 encoding"
      )
    }
    this.maxTextCodeUnits = boundedInteger(
      options.maxTextCodeUnits ?? EXTENSION_SURFACE_MAX_TEXT_CODE_UNITS,
      "Maximum text code units",
      1,
      EXTENSION_SURFACE_MAX_TEXT_CODE_UNITS
    )
    if (
      typeof options.text !== "string" ||
      options.text.length > this.maxTextCodeUnits
    ) {
      throw new ExtensionTextDocumentError(
        "PROTOCOL_ERROR",
        `Document exceeds ${this.maxTextCodeUnits} code units`
      )
    }
    this.maxHistoryEntries = boundedInteger(
      options.maxHistoryEntries ?? DEFAULT_MAX_HISTORY_ENTRIES,
      "Maximum history entries",
      0
    )
    this.maxHistoryCodeUnits = boundedInteger(
      options.maxHistoryCodeUnits ?? DEFAULT_MAX_HISTORY_CODE_UNITS,
      "Maximum history code units",
      0
    )
    this.maxPendingSaves = boundedInteger(
      options.maxPendingSaves ?? DEFAULT_MAX_PENDING_SAVES,
      "Maximum pending saves",
      1
    )
    this.text = options.text
    this.savedText = options.text
    this.persistedContentDigest = requiredText(
      options.persistedContentDigest,
      "Persisted content digest",
      256
    )
    this.readOnly = options.readOnly ?? false
  }

  getSnapshot(): ExtensionTextDocumentSnapshot {
    return {
      documentId: this.documentId,
      resource: { ...this.resource },
      text: this.text,
      persistedContentDigest: this.persistedContentDigest,
      ...this.state(),
    }
  }

  applyEdits(
    originViewId: string,
    documentId: string,
    baseRevision: number,
    editsValue: unknown
  ): ExtensionTextDocumentChangedMessage {
    const validatedViewId = requiredText(originViewId, "Origin view ID", 256)
    this.assertMutable(documentId, baseRevision)
    let edits: ExtensionTextEdit[]
    let inverse: ExtensionTextEdit[]
    let nextText: string
    try {
      edits = validateExtensionTextEdits(editsValue, {
        documentLength: this.text.length,
        maxTextCodeUnits: this.maxTextCodeUnits,
      })
      inverse = invertExtensionTextEdits(this.text, edits)
      nextText = applyExtensionTextEdits(this.text, edits, {
        maxTextCodeUnits: this.maxTextCodeUnits,
      })
    } catch (error) {
      if (error instanceof ExtensionSurfaceProtocolError) {
        throw new ExtensionTextDocumentError("INVALID_EDIT", error.message)
      }
      throw error
    }
    this.text = nextText
    this.revision += 1
    this.redoStack = []
    this.pushUndo({
      forward: copyEdits(edits),
      inverse: copyEdits(inverse),
      codeUnits: editCodeUnits(edits, inverse),
    })
    return this.changed(validatedViewId, "edit", edits)
  }

  undo(
    originViewId: string,
    documentId: string,
    baseRevision: number
  ): ExtensionTextDocumentChangedMessage {
    const validatedViewId = requiredText(originViewId, "Origin view ID", 256)
    this.assertMutable(documentId, baseRevision)
    const entry = this.undoStack.pop()
    if (!entry) {
      throw new ExtensionTextDocumentError(
        "NOT_AVAILABLE",
        "No document edit is available to undo"
      )
    }
    this.undoCodeUnits -= entry.codeUnits
    this.text = applyExtensionTextEdits(this.text, entry.inverse, {
      maxTextCodeUnits: this.maxTextCodeUnits,
    })
    this.revision += 1
    this.redoStack.push(entry)
    return this.changed(validatedViewId, "undo", entry.inverse)
  }

  redo(
    originViewId: string,
    documentId: string,
    baseRevision: number
  ): ExtensionTextDocumentChangedMessage {
    const validatedViewId = requiredText(originViewId, "Origin view ID", 256)
    this.assertMutable(documentId, baseRevision)
    const entry = this.redoStack.pop()
    if (!entry) {
      throw new ExtensionTextDocumentError(
        "NOT_AVAILABLE",
        "No document edit is available to redo"
      )
    }
    this.text = applyExtensionTextEdits(this.text, entry.forward, {
      maxTextCodeUnits: this.maxTextCodeUnits,
    })
    this.revision += 1
    this.pushUndo(entry)
    return this.changed(validatedViewId, "redo", entry.forward)
  }

  beginSave(
    documentId: string,
    baseRevision: number
  ): ExtensionTextDocumentSaveToken {
    this.assertDocument(documentId)
    this.assertRevision(baseRevision)
    if (this.readOnly) {
      throw new ExtensionTextDocumentError("READ_ONLY", "Document is read-only")
    }
    if (this.pendingExternal) {
      throw new ExtensionTextDocumentError(
        "CONFLICT",
        "Resolve the external file conflict before saving"
      )
    }
    if (this.pendingSaves.size >= this.maxPendingSaves) {
      throw new ExtensionTextDocumentError(
        "NOT_AVAILABLE",
        "Too many document saves are already in flight"
      )
    }
    const token: ExtensionTextDocumentSaveToken = {
      tokenId: `save-${++this.saveSequence}`,
      documentId: this.documentId,
      revision: this.revision,
      text: this.text,
      expectedPersistedContentDigest: this.persistedContentDigest,
    }
    this.pendingSaves.set(token.tokenId, token)
    return { ...token }
  }

  completeSave(
    token: ExtensionTextDocumentSaveToken,
    persistedContentDigest: string
  ): ExtensionTextDocumentStateMessage {
    const issued = this.pendingSaves.get(token.tokenId)
    if (!issued || !sameSaveToken(token, issued)) {
      throw new ExtensionTextDocumentError(
        "NOT_AVAILABLE",
        "Save token is unknown, altered, or already consumed"
      )
    }
    this.pendingSaves.delete(token.tokenId)
    this.assertDocument(token.documentId)
    if (
      this.pendingExternal ||
      token.revision > this.revision ||
      token.expectedPersistedContentDigest !== this.persistedContentDigest
    ) {
      throw new ExtensionTextDocumentError(
        "CONFLICT",
        "Persisted document changed while the save was in flight"
      )
    }
    if (token.text.length > this.maxTextCodeUnits) {
      throw new ExtensionTextDocumentError(
        "PROTOCOL_ERROR",
        "Save token exceeds the document limit"
      )
    }
    this.persistedContentDigest = requiredText(
      persistedContentDigest,
      "Persisted content digest",
      256
    )
    this.savedText = token.text
    this.savedRevision = token.revision
    return this.stateMessage()
  }

  cancelSave(token: ExtensionTextDocumentSaveToken): void {
    const issued = this.pendingSaves.get(token.tokenId)
    if (!issued || !sameSaveToken(token, issued)) {
      throw new ExtensionTextDocumentError(
        "NOT_AVAILABLE",
        "Save token is unknown, altered, or already consumed"
      )
    }
    this.pendingSaves.delete(token.tokenId)
  }

  observeExternalSnapshot(
    external: ExtensionExternalDocumentSnapshot
  ):
    | ExtensionTextDocumentReplacedMessage
    | ExtensionTextDocumentStateMessage
    | undefined {
    this.assertExternal(external)
    if (external.contentDigest === this.persistedContentDigest) {
      if (!this.pendingExternal) return undefined
      this.pendingExternal = undefined
      return this.stateMessage()
    }
    if (external.text === this.text) {
      this.persistedContentDigest = external.contentDigest
      this.savedText = this.text
      this.savedRevision = this.revision
      this.pendingExternal = undefined
      this.pendingSaves.clear()
      return this.stateMessage()
    }
    if (this.isDirty()) {
      this.pendingExternal = { public: { ...external } }
      return this.stateMessage()
    }
    return this.replaceWithExternal(external, "external-reload")
  }

  resolveExternalConflict(
    resolution: "reload" | "overwrite"
  ): ExtensionTextDocumentReplacedMessage | ExtensionTextDocumentStateMessage {
    const pending = this.pendingExternal?.public
    if (!pending) {
      throw new ExtensionTextDocumentError(
        "NOT_AVAILABLE",
        "No external file conflict is pending"
      )
    }
    if (resolution !== "reload" && resolution !== "overwrite") {
      throw new ExtensionTextDocumentError(
        "PROTOCOL_ERROR",
        "External conflict resolution must be reload or overwrite"
      )
    }
    if (resolution === "reload") {
      return this.replaceWithExternal(pending, "conflict-reload")
    }
    this.persistedContentDigest = pending.contentDigest
    this.savedText = pending.text
    this.pendingExternal = undefined
    this.pendingSaves.clear()
    return this.stateMessage()
  }

  setReadOnly(readOnly: boolean): ExtensionTextDocumentStateMessage {
    if (typeof readOnly !== "boolean") {
      throw new ExtensionTextDocumentError(
        "PROTOCOL_ERROR",
        "Read-only state must be a boolean"
      )
    }
    this.readOnly = readOnly
    return this.stateMessage()
  }

  resync(): ExtensionTextDocumentReplacedMessage {
    return {
      type: "document-replaced",
      reason: "resync",
      snapshot: this.getSnapshot(),
    }
  }

  private state(): ExtensionTextDocumentState {
    const external = this.pendingExternal?.public
    return {
      revision: this.revision,
      savedRevision: this.savedRevision,
      dirty: this.isDirty(),
      readOnly: this.readOnly,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      externalConflict: external
        ? {
            contentDigest: external.contentDigest,
            size: external.size,
            mtimeMs: external.mtimeMs,
          }
        : undefined,
    }
  }

  private stateMessage(): ExtensionTextDocumentStateMessage {
    return {
      type: "document-state",
      documentId: this.documentId,
      ...this.state(),
    }
  }

  private changed(
    originViewId: string,
    reason: ExtensionTextDocumentChangedMessage["reason"],
    edits: readonly ExtensionTextEdit[]
  ): ExtensionTextDocumentChangedMessage {
    return {
      type: "document-changed",
      documentId: this.documentId,
      originViewId: requiredText(originViewId, "Origin view ID", 256),
      reason,
      edits: copyEdits(edits),
      ...this.state(),
    }
  }

  private pushUndo(entry: HistoryEntry): void {
    if (this.maxHistoryEntries === 0 || this.maxHistoryCodeUnits === 0) return
    this.undoStack.push(entry)
    this.undoCodeUnits += entry.codeUnits
    while (
      this.undoStack.length > this.maxHistoryEntries ||
      this.undoCodeUnits > this.maxHistoryCodeUnits
    ) {
      const removed = this.undoStack.shift()
      if (!removed) break
      this.undoCodeUnits -= removed.codeUnits
    }
  }

  private replaceWithExternal(
    external: ExtensionExternalDocumentSnapshot,
    reason: ExtensionTextDocumentReplacedMessage["reason"]
  ): ExtensionTextDocumentReplacedMessage {
    this.text = external.text
    this.savedText = external.text
    this.persistedContentDigest = external.contentDigest
    this.revision += 1
    this.savedRevision = this.revision
    this.undoStack = []
    this.redoStack = []
    this.undoCodeUnits = 0
    this.pendingExternal = undefined
    this.pendingSaves.clear()
    return { type: "document-replaced", reason, snapshot: this.getSnapshot() }
  }

  private assertExternal(external: ExtensionExternalDocumentSnapshot): void {
    requiredText(external.contentDigest, "External content digest", 256)
    if (
      typeof external.text !== "string" ||
      external.text.length > this.maxTextCodeUnits ||
      !Number.isSafeInteger(external.size) ||
      external.size < 0 ||
      !Number.isFinite(external.mtimeMs) ||
      external.mtimeMs < 0
    ) {
      throw new ExtensionTextDocumentError(
        "PROTOCOL_ERROR",
        "External document snapshot is invalid"
      )
    }
  }

  private assertMutable(documentId: string, baseRevision: number): void {
    this.assertDocument(documentId)
    this.assertRevision(baseRevision)
    if (this.readOnly) {
      throw new ExtensionTextDocumentError("READ_ONLY", "Document is read-only")
    }
  }

  private assertDocument(documentId: string): void {
    if (documentId !== this.documentId) {
      throw new ExtensionTextDocumentError(
        "DOCUMENT_MISMATCH",
        "Surface request belongs to another document"
      )
    }
  }

  private assertRevision(baseRevision: number): void {
    if (baseRevision !== this.revision) {
      throw new ExtensionTextDocumentError(
        "STALE_REVISION",
        `Expected document revision ${this.revision}, received ${baseRevision}`
      )
    }
  }

  private isDirty(): boolean {
    return this.text !== this.savedText
  }
}
