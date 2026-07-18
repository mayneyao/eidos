# `@eidos.space/eidos-file-ui`

React provider, view host, and reusable editors for the open Eidos File format.

## Install

```bash
pnpm add @eidos.space/eidos-file@0.1.0 \
  @eidos.space/eidos-file-ui@0.1.0 \
  @glideapps/glide-data-grid marked@^4 react react-dom
```

Import the precompiled stylesheet once. Consumers do not need Tailwind.

```ts
import "@eidos.space/eidos-file-ui/styles.css"
```

## Embed a view host

Create an `EidosFileSession` with a host adapter, then provide it to React.

```tsx
import { useMemo } from "react"
import { EidosFileSession } from "@eidos.space/eidos-file"
import {
  EidosFileBrowserRuntime,
  IndexedDbEidosFileRecoveryStore,
} from "@eidos.space/eidos-file/browser"
import {
  EidosFileProvider,
  EidosFileViewHost,
} from "@eidos.space/eidos-file-ui"
import "@eidos.space/eidos-file-ui/styles.css"

export function Editor() {
  const session = useMemo(
    () =>
      new EidosFileSession(
        new EidosFileBrowserRuntime(),
        new IndexedDbEidosFileRecoveryStore()
      ),
    []
  )

  return (
    <EidosFileProvider session={session} themeName="light">
      <EidosFileViewHost />
    </EidosFileProvider>
  )
}
```

The host owns file selection, session cleanup, view switching, and conflict UI.
The view host owns only rendering and public data operations.

## Build a view

Custom views receive a typed table, persisted view descriptor, normalized query,
async data source, selection, local view state, commands, and explicit
capabilities.

```tsx
import {
  defineEidosFileView,
  type EidosFileViewRendererProps,
} from "@eidos.space/eidos-file-ui"

function Timeline({ source, table, query }: EidosFileViewRendererProps) {
  // Page through source.getPage(table.table.id, …, query).
  return <section aria-label={`${table.table.name} timeline`} />
}

export const timeline = defineEidosFileView({
  type: "timeline",
  label: "Timeline",
  description: "Group records by date",
  renderer: Timeline,
  create: { defaultName: "Timeline" },
})
```

Register the renderer directly or include it in a trusted plugin:

```tsx
<EidosFileViewHost renderers={{ timeline: timeline.renderer }} />
```

Persisted view type keys round-trip even when a renderer is unavailable.

## Trust and capabilities

React views are trusted, statically imported host code. This package is not an
extension sandbox. The props contract intentionally does not expose raw file
bytes, native filesystem access, SQLite, application routes, stores, or IPC.
`capabilities.rawFile` and `capabilities.nativeFileSystem` are always `false`.

## Styles and theme

`styles.css` contains the utilities used by the package and scoped Eidos theme
tokens. `EidosFileProvider` applies the `[data-eidos-file-root]` boundary and
supports `themeName="light" | "dark"`. Hosts can override CSS variables on that
element without copying Eidos global CSS.
