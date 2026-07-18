# `@eidos.space/eidos-file`

Headless runtime and host contracts for portable Eidos `.eidos` files.

An Eidos File is a normal SQLite database containing portable table, field,
view, and relation metadata. The package does not depend on the Eidos app,
Zustand stores, routes, Electron IPC, or a database singleton.

## Install

```bash
pnpm add @eidos.space/eidos-file@0.1.0
```

Add `@eidos.space/eidos-file-ui@0.1.0` when rendering React views.

## Browser host

The browser entry includes a SQLite WASM runtime, native file picker adapter,
copy-mode fallback, conflict detection, and IndexedDB recovery store.

```ts
import { EidosFileSession } from "@eidos.space/eidos-file"
import {
  EidosFileBrowserRuntime,
  IndexedDbEidosFileRecoveryStore,
  openBrowserEidosFile,
  pickBrowserEidosFile,
} from "@eidos.space/eidos-file/browser"

const session = new EidosFileSession(
  new EidosFileBrowserRuntime(),
  new IndexedDbEidosFileRecoveryStore()
)

const direct = await pickBrowserEidosFile()
const imported = fileInput.files?.[0]
  ? await openBrowserEidosFile(fileInput.files[0])
  : null
const handle = direct ?? imported

if (handle) await session.open(handle)
```

SQLite WASM uses WebAssembly and top-level await. A Vite host should enable the
same two standard plugins:

```ts
import { defineConfig } from "vite"
import topLevelAwait from "vite-plugin-top-level-await"
import wasm from "vite-plugin-wasm"

export default defineConfig({
  plugins: [wasm(), topLevelAwait()],
  optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
})
```

Call `session.markDirty()` after a committed mutation. `checkpoint()` stores a
recoverable working copy. `save()` exports an integrity-checked database and
performs a compare-and-swap write against the revision observed at open time.

```ts
import { EidosFileHostError } from "@eidos.space/eidos-file"

session.markDirty()
await session.checkpoint()

try {
  await session.save()
} catch (error) {
  if (error instanceof EidosFileHostError && error.code === "conflict") {
    // Offer reload, forced overwrite, or Save As. Do not silently choose.
  }
}
```

Chromium-based browsers can write to the original file after user permission.
Other browsers open an imported copy; hosts can offer Save As when supported or
`downloadEidosFile()` as the fallback. File bytes stay in the browser.

## Node and Electron

The optional `better-sqlite3` entry owns native file access. The main entry
remains browser-safe and works against the small `EidosFileConnection`
interface.

```ts
import { createEidosFile } from "@eidos.space/eidos-file/better-sqlite3"

const file = createEidosFile("tasks.eidos", {
  title: "Tasks",
  defaultTable: { name: "Tasks" },
})

file.insertRow(file.info().defaultTableId!, { title: "Ship Eidos File" })
file.close()
```

## Public boundaries

- `EidosFileDescriptor` is adapter-owned identity, metadata, size, and an
  opaque revision token.
- `EidosFileHandle` owns reading, permissions, and optional verified writes.
- `EidosFileRuntimeAdapter` turns bytes into an `EidosFileDocument`.
- `EidosFileDataSource` is the async paging and mutation contract consumed by
  views.
- `EidosFileSession` owns open, dirty, saving, conflict, error, recovery, and
  cleanup states.
- `EidosFileHandlerRegistry` matches file types. It does not install or execute
  extensions.

See [DEVELOPER_PLATFORM.md](./DEVELOPER_PLATFORM.md) for the audited product
boundary and first-release scope.

## Security

Adapters are the authority boundary. A view never receives SQLite, a native
file handle, the browser picker, Electron IPC, or host application state.
React views are trusted application code, not sandboxed extensions. A host must
review and statically import them just like any other dependency.

## Format notes

Files remain valid SQLite databases and can be inspected with ordinary SQLite
tools. Gallery and Kanban query indexes are disposable SQLite indexes maintained
by the runtime; they are not Eidos metadata or user data.
