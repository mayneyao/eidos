import type {
  ExtensionSurfaceAppearance,
  ExtensionSurfaceCapabilities,
  ExtensionJsonValue,
  ExtensionSurfaceSaveStateMessage,
  ExtensionTextDocumentChangedMessage,
  ExtensionTextDocumentReplacedMessage,
  ExtensionTextDocumentSnapshot,
  ExtensionTextDocumentStateMessage,
  ExtensionTextEdit,
} from "@eidos.space/extension-surface-protocol"

export type { ExtensionJsonValue } from "@eidos.space/extension-surface-protocol"

export interface ExtensionCommandResource {
  /** Portable path relative to the current Space root. */
  path: string
}

export type ExtensionCommandHandler = (
  resource: ExtensionCommandResource
) => void | Promise<void>

export interface ExtensionDisposable {
  dispose(): void
}

export interface ExtensionSubscriptionStore {
  add(disposable: ExtensionDisposable): void
}

export interface ExtensionCommandRegistry {
  register(
    commandId: string,
    handler: ExtensionCommandHandler
  ): ExtensionDisposable
}

export interface ExtensionSpaceFiles {
  /** Requires a matching, currently granted `files.read` capability. */
  readText(path: string): Promise<string>
}

export interface ExtensionWindowNotice {
  message: string
}

export interface ExtensionWindowConfirm {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
}

export interface ExtensionWindowSelectItem {
  value: string
  label: string
  description?: string
}

export interface ExtensionWindowSelect {
  title: string
  placeholder?: string
  items: ExtensionWindowSelectItem[]
}

export interface ExtensionWindowOpenPanel {
  /** A namespaced panel ID declared in `contributes.panels`. */
  panelId: string
  /** Bounded, JSON-safe initialization data copied into the panel session. */
  state?: ExtensionJsonValue
}

export interface ExtensionWindow {
  showNotice(notice: string | ExtensionWindowNotice): void
  confirm(request: ExtensionWindowConfirm): Promise<boolean>
  select(request: ExtensionWindowSelect): Promise<string | undefined>
  openPanel(request: ExtensionWindowOpenPanel): Promise<void>
}

export interface ExtensionContext {
  readonly extensionId: string
  readonly subscriptions: ExtensionSubscriptionStore
  readonly commands: ExtensionCommandRegistry
  readonly space: {
    readonly files: ExtensionSpaceFiles
  }
  readonly window: ExtensionWindow
}

export type ExtensionActivate = (
  context: ExtensionContext
) => void | Promise<void>

export interface ExtensionFileEditorDocument {
  /** Latest immutable host snapshot known to this surface. */
  readonly snapshot: ExtensionTextDocumentSnapshot
  applyEdits(edits: readonly ExtensionTextEdit[]): Promise<number>
  save(): Promise<number>
  undo(): Promise<number>
  redo(): Promise<number>
  resync(): Promise<number>
  onDidChange(
    listener: (
      event:
        | ExtensionTextDocumentChangedMessage
        | ExtensionTextDocumentReplacedMessage
    ) => void
  ): ExtensionDisposable
  onDidChangeState(
    listener: (event: ExtensionTextDocumentStateMessage) => void
  ): ExtensionDisposable
  onDidChangeSaveState(
    listener: (event: ExtensionSurfaceSaveStateMessage) => void
  ): ExtensionDisposable
}

export interface ExtensionFileEditorAppearance {
  readonly current: ExtensionSurfaceAppearance
  onDidChange(
    listener: (appearance: ExtensionSurfaceAppearance) => void
  ): ExtensionDisposable
}

export interface ExtensionFileEditorContext {
  readonly extensionId: string
  readonly editorId: string
  readonly viewId: string
  /** The only host-provided DOM mount point. */
  readonly root: HTMLElement
  readonly document: ExtensionFileEditorDocument
  readonly appearance: ExtensionFileEditorAppearance
  readonly capabilities: ExtensionSurfaceCapabilities
  readonly subscriptions: ExtensionSubscriptionStore
}

export type ExtensionFileEditorActivate = (
  context: ExtensionFileEditorContext
) => void | ExtensionDisposable | Promise<void | ExtensionDisposable>

export interface ExtensionPanelContext {
  readonly extensionId: string
  readonly panelId: string
  readonly sessionId: string
  /** The only host-provided DOM mount point. */
  readonly root: HTMLElement
  /** Immutable one-shot initialization data supplied by the worker. */
  readonly state: ExtensionJsonValue | undefined
  readonly appearance: ExtensionFileEditorAppearance
  readonly subscriptions: ExtensionSubscriptionStore
}

export type ExtensionPanelActivate = (
  context: ExtensionPanelContext
) => void | ExtensionDisposable | Promise<void | ExtensionDisposable>
