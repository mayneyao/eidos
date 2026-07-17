export const EXTENSION_SURFACE_PROTOCOL_VERSION = 1 as const
export const EXTENSION_SURFACE_BOOTSTRAP_CHANNEL =
  "file-extension-surface:bootstrap" as const

export type ExtensionJsonValue =
  | null
  | boolean
  | number
  | string
  | ExtensionJsonValue[]
  | { [key: string]: ExtensionJsonValue }

/** V1 uses JavaScript UTF-16 code-unit offsets on both sides of MessagePort. */
export interface ExtensionTextEdit {
  start: number
  end: number
  text: string
}

export interface ExtensionTextDocumentResource {
  /** Portable path relative to the current Space root. */
  path: string
  mediaType: string
  languageId?: string
  encoding: "utf-8"
}

export interface ExtensionExternalDocumentVersion {
  contentDigest: string
  size: number
  mtimeMs: number
}

export interface ExtensionTextDocumentState {
  revision: number
  savedRevision: number
  dirty: boolean
  readOnly: boolean
  canUndo: boolean
  canRedo: boolean
  externalConflict?: ExtensionExternalDocumentVersion
}

export interface ExtensionTextDocumentSnapshot extends ExtensionTextDocumentState {
  documentId: string
  resource: ExtensionTextDocumentResource
  text: string
  /** Digest of the last file bytes accepted as the persisted baseline. */
  persistedContentDigest: string
}

export interface ExtensionSurfaceSavePolicyOff {
  mode: "off"
}

export interface ExtensionSurfaceSavePolicyAfterDelay {
  mode: "afterDelay"
  delayMs: number
}

export type ExtensionSurfaceSavePolicy =
  | ExtensionSurfaceSavePolicyOff
  | ExtensionSurfaceSavePolicyAfterDelay

export interface ExtensionSurfaceCapabilities {
  editable: boolean
  save: boolean
  undoRedo: boolean
  savePolicy: ExtensionSurfaceSavePolicy
}

export type ExtensionSurfaceColorScheme = "light" | "dark"

/**
 * A deliberately small, host-owned token set. Surfaces receive resolved CSS
 * values instead of class names so they cannot depend on Eidos' internal DOM
 * or Tailwind configuration.
 */
export interface ExtensionSurfaceThemeTokens {
  background: string
  foreground: string
  mutedBackground: string
  mutedForeground: string
  border: string
  accent: string
  accentForeground: string
  destructive: string
  destructiveForeground: string
  focusRing: string
  fontFamily: string
  monoFontFamily: string
}

export interface ExtensionSurfaceAppearance {
  colorScheme: ExtensionSurfaceColorScheme
  locale: string
  theme: ExtensionSurfaceThemeTokens
}

interface ExtensionSurfaceInitializeBase {
  type: "initialize"
  protocolVersion: typeof EXTENSION_SURFACE_PROTOCOL_VERSION
  packageId: string
  generation: string
  appearance: ExtensionSurfaceAppearance
}

export interface ExtensionFileEditorSurfaceInitializeMessage extends ExtensionSurfaceInitializeBase {
  surfaceKind: "file-editor"
  editorId: string
  viewId: string
  snapshot: ExtensionTextDocumentSnapshot
  capabilities: ExtensionSurfaceCapabilities
}

export interface ExtensionPanelSurfaceInitializeMessage extends ExtensionSurfaceInitializeBase {
  surfaceKind: "panel"
  panelId: string
  sessionId: string
  state?: ExtensionJsonValue
}

export interface ExtensionEidosFileFieldSnapshot {
  name: string
  columnName: string
  type: string
  property: ExtensionJsonValue
}

export interface ExtensionEidosFileViewContextSnapshot {
  resourcePath: string
  table: {
    id: string
    name: string
    rowCount: number
  }
  view: {
    id: string
    name: string
  }
  fields: ExtensionEidosFileFieldSnapshot[]
}

export interface ExtensionEidosFileViewSurfaceInitializeMessage extends ExtensionSurfaceInitializeBase {
  surfaceKind: "eidos-file-view"
  eidosFileViewId: string
  viewId: string
  context: ExtensionEidosFileViewContextSnapshot
}

export type ExtensionSurfaceInitializeMessage =
  | ExtensionFileEditorSurfaceInitializeMessage
  | ExtensionPanelSurfaceInitializeMessage
  | ExtensionEidosFileViewSurfaceInitializeMessage

export interface ExtensionSurfaceAppearanceChangedMessage {
  type: "appearance-changed"
  appearance: ExtensionSurfaceAppearance
}

export interface ExtensionTextDocumentChangedMessage extends ExtensionTextDocumentState {
  type: "document-changed"
  documentId: string
  originViewId: string
  reason: "edit" | "undo" | "redo"
  edits: ExtensionTextEdit[]
}

export interface ExtensionTextDocumentReplacedMessage {
  type: "document-replaced"
  reason: "external-reload" | "conflict-reload" | "resync"
  snapshot: ExtensionTextDocumentSnapshot
}

export interface ExtensionTextDocumentStateMessage extends ExtensionTextDocumentState {
  type: "document-state"
  documentId: string
  persistedContentDigest: string
}

export interface ExtensionSurfaceSaveStateMessage {
  type: "save-state"
  documentId: string
  revision: number
  state: "saving" | "saved" | "error"
  message?: string
}

export type ExtensionSurfaceRequestErrorCode =
  | "CONFLICT"
  | "DOCUMENT_MISMATCH"
  | "INVALID_EDIT"
  | "NOT_AVAILABLE"
  | "PROTOCOL_ERROR"
  | "READ_ONLY"
  | "RUNTIME_STALE"
  | "SAVE_FAILED"
  | "STALE_REVISION"

export interface ExtensionSurfaceRequestSuccess {
  type: "request-result"
  requestId: string
  ok: true
  revision: number
}

export interface ExtensionSurfaceRequestFailure {
  type: "request-result"
  requestId: string
  ok: false
  revision: number
  error: {
    code: ExtensionSurfaceRequestErrorCode
    message: string
  }
}

export interface ExtensionSurfaceDisposeMessage {
  type: "dispose"
  reason: string
}

export interface ExtensionEidosFileViewContextChangedMessage {
  type: "eidos-file-context-changed"
  context: ExtensionEidosFileViewContextSnapshot
}

export interface ExtensionEidosFilePageResultSuccess {
  type: "eidos-file-page-result"
  requestId: string
  ok: true
  page: {
    offset: number
    limit: number
    total: number
    rows: Array<Record<string, ExtensionJsonValue>>
  }
}

export interface ExtensionEidosFilePageResultFailure {
  type: "eidos-file-page-result"
  requestId: string
  ok: false
  error: { message: string }
}

export type ExtensionEidosFilePageResult =
  | ExtensionEidosFilePageResultSuccess
  | ExtensionEidosFilePageResultFailure

export type ExtensionHostToSurfaceMessage =
  | ExtensionSurfaceInitializeMessage
  | ExtensionSurfaceAppearanceChangedMessage
  | ExtensionTextDocumentChangedMessage
  | ExtensionTextDocumentReplacedMessage
  | ExtensionTextDocumentStateMessage
  | ExtensionSurfaceSaveStateMessage
  | ExtensionSurfaceRequestSuccess
  | ExtensionSurfaceRequestFailure
  | ExtensionEidosFileViewContextChangedMessage
  | ExtensionEidosFilePageResult
  | ExtensionSurfaceDisposeMessage

export interface ExtensionSurfaceReadyMessage {
  type: "ready"
  protocolVersion: typeof EXTENSION_SURFACE_PROTOCOL_VERSION
}

export interface ExtensionSurfaceActivatedMessage {
  type: "activated"
}

export interface ExtensionSurfaceActivationErrorMessage {
  type: "activation-error"
  message: string
}

export type ExtensionSurfaceLogLevel =
  | "debug"
  | "info"
  | "log"
  | "warn"
  | "error"

export interface ExtensionSurfaceLogMessage {
  type: "surface-log"
  generation: string
  level: ExtensionSurfaceLogLevel
  message: string
}

export interface ExtensionSurfaceApplyEditsRequest {
  type: "apply-edits"
  requestId: string
  documentId: string
  eidosFileRevision: number
  edits: ExtensionTextEdit[]
}

export interface ExtensionSurfaceDocumentRequest {
  type: "request-save" | "request-undo" | "request-redo" | "request-resync"
  requestId: string
  documentId: string
  eidosFileRevision: number
}

export interface ExtensionSurfaceClosedMessage {
  type: "closed"
}

export interface ExtensionEidosFilePageRequest {
  type: "eidos-file-page-request"
  requestId: string
  generation: string
  offset: number
  limit: number
}

export type ExtensionSurfaceToHostMessage =
  | ExtensionSurfaceReadyMessage
  | ExtensionSurfaceActivatedMessage
  | ExtensionSurfaceActivationErrorMessage
  | ExtensionSurfaceLogMessage
  | ExtensionEidosFilePageRequest
  | ExtensionSurfaceApplyEditsRequest
  | ExtensionSurfaceDocumentRequest
  | ExtensionSurfaceClosedMessage

export interface ExtensionTextDocumentSaveToken {
  /** Opaque, single-use token issued by the host-owned document model. */
  tokenId: string
  documentId: string
  revision: number
  text: string
  /** Compare-and-swap baseline that the host must still observe before writing. */
  expectedPersistedContentDigest: string
}

export interface ExtensionExternalDocumentSnapshot extends ExtensionExternalDocumentVersion {
  text: string
}
