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

export interface ExtensionWindow {
  showNotice(notice: string | ExtensionWindowNotice): void
  confirm(request: ExtensionWindowConfirm): Promise<boolean>
  select(request: ExtensionWindowSelect): Promise<string | undefined>
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
