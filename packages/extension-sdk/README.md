# `@eidos.space/extension-sdk`

Public TypeScript contracts for Eidos file-based extensions. Extension code
receives an `ExtensionContext` from the host and never receives Electron,
SQLite, or raw filesystem handles.

Version 1 extension packages should use this package through a type-only
import. Eidos supplies the runtime context when it activates the package.

Worker entrypoints receive `ExtensionContext`. UI entrypoints receive
`ExtensionFileEditorContext`, including a sandbox-owned DOM root, immutable
host document snapshots, bounded edit/save/undo requests, resolved appearance
tokens, and disposable event subscriptions. UI code never owns persistence or
conflict resolution.
