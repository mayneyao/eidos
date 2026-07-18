# Build with Eidos File

Eidos File `0.1.0` has two public layers: a host-neutral runtime and a React view host. Your application owns file selection, permissions, save decisions, and trusted view code. The packages own the portable data and view contracts.

## Install

```bash
pnpm add @eidos.space/eidos-file@0.1.0 \
  @eidos.space/eidos-file-ui@0.1.0 \
  @glideapps/glide-data-grid marked@^4 react react-dom
```

Import the compiled stylesheet once. Consumers do not need Tailwind.

```ts
import "@eidos.space/eidos-file-ui/styles.css"
```

Browser builds use SQLite WASM and top-level await. In Vite, add `vite-plugin-wasm` and `vite-plugin-top-level-await`, then exclude `@sqlite.org/sqlite-wasm` from dependency optimization.

## Embed the view host

Create one `EidosFileSession`, connect it to the browser adapter, and pass it through the React provider:

```tsx
import { useEffect, useMemo } from "react"
import { EidosFileSession } from "@eidos.space/eidos-file"
import {
  EidosFileBrowserRuntime,
  IndexedDbEidosFileRecoveryStore,
  pickBrowserEidosFile,
} from "@eidos.space/eidos-file/browser"
import {
  EidosFileProvider,
  EidosFileViewHost,
} from "@eidos.space/eidos-file-ui"
import "@eidos.space/eidos-file-ui/styles.css"

export function EidosFileEditor() {
  const session = useMemo(
    () =>
      new EidosFileSession(
        new EidosFileBrowserRuntime(),
        new IndexedDbEidosFileRecoveryStore()
      ),
    []
  )

  useEffect(() => () => void session.close(), [session])

  async function openFile() {
    const handle = await pickBrowserEidosFile()
    if (handle) await session.open(handle)
  }

  return (
    <EidosFileProvider session={session} themeName="light">
      <button type="button" onClick={() => void openFile()}>
        Open .eidos file
      </button>
      <EidosFileViewHost />
    </EidosFileProvider>
  )
}
```

`EidosFileViewHost` renders the active saved view. The host remains responsible for choosing a file, switching views, presenting save and conflict actions, and closing the session.

## Build a typed view

A renderer receives an async data source, typed table and view descriptors, normalized query state, selection, commands, and explicit capabilities. It never receives SQLite, raw file bytes, routes, Zustand stores, or Electron IPC.

```tsx
import { useEffect, useState } from "react"
import type { EidosFileRow } from "@eidos.space/eidos-file"
import {
  defineEidosFileView,
  type EidosFileViewRendererProps,
} from "@eidos.space/eidos-file-ui"

function Timeline({
  source,
  table,
  query,
  reloadToken,
  disabled,
  onMutation,
  onError,
}: EidosFileViewRendererProps) {
  const [rows, setRows] = useState<EidosFileRow[]>([])

  useEffect(() => {
    let active = true
    source
      .getPage(table.table.id, 0, 50, query)
      .then((page) => active && setRows(page.rows))
      .catch(onError)
    return () => {
      active = false
    }
  }, [onError, query, reloadToken, source, table.table.id])

  return (
    <ol aria-label={`${table.table.name} timeline`}>
      {rows.map((row) => (
        <li key={String(row._id)}>
          <time>{String(row.due ?? "Unscheduled")}</time>
          <button
            type="button"
            disabled={disabled}
            onClick={async () => {
              try {
                const result = await source.updateRow(
                  table.table.id,
                  String(row._id),
                  { status: "Done" }
                )
                onMutation?.(result)
              } catch (error) {
                onError?.(error)
              }
            }}
          >
            {String(row.title ?? "Untitled")}
          </button>
        </li>
      ))}
    </ol>
  )
}

export const timelineView = defineEidosFileView({
  type: "com.example.timeline",
  label: "Timeline",
  description: "Place dated records on a delivery timeline.",
  renderer: Timeline,
  create: { defaultName: "Timeline" },
})
```

Register the renderer with its persisted type:

```tsx
<EidosFileViewHost
  renderers={{ "com.example.timeline": timelineView.renderer }}
/>
```

To create the saved view, call the session's public data source and mark the returned snapshot dirty:

```ts
const source = session.getState().source
const next = await source?.createView(tableId, {
  name: timelineView.create.defaultName,
  type: timelineView.type,
})

if (next) session.markDirty(next)
```

Use a namespaced type for third-party views. If another host does not install your renderer, it can fall back to Grid while preserving the type and JSON-compatible `view.properties`.

## Save, conflict, and recovery

After a committed mutation, call `session.markDirty(nextSnapshot?)`. Save performs a compare-and-swap write against the revision observed when the file opened.

```ts
import { EidosFileHostError } from "@eidos.space/eidos-file"

session.markDirty()
await session.checkpoint()

try {
  await session.save()
} catch (error) {
  if (error instanceof EidosFileHostError && error.code === "conflict") {
    // Offer reload, explicit overwrite, or Save As.
  }
}
```

Never resolve conflicts silently. Chromium hosts may write to the original after permission is granted. Other browsers should offer Save As or download a copy. File bytes remain in the browser.

## Public boundary

| Layer                             | Owns                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `@eidos.space/eidos-file`         | descriptors, handlers, runtime, paging, mutations, session state, conflict and recovery contracts |
| `@eidos.space/eidos-file/browser` | browser handles, SQLite WASM, pickers, downloads, and IndexedDB recovery                          |
| `@eidos.space/eidos-file-ui`      | provider, hooks, view host, shared views, commands, selection, and scoped styles                  |
| your host                         | permissions, navigation, persistence decisions, error UI, and trusted renderer imports            |

React views are trusted application code, not sandboxed Eidos Space extensions. Review them like any other dependency and grant only the host capabilities they need.
