# `@eidos.space/eidos-file-ui`

Trusted React presentation for the frozen Eidos UI 1.0 boundary.

The exact Viewer composition depends only on `HostServices` and the
`RuntimeClient` returned by Host. It does not receive SQLite, File bytes,
filesystem paths/handles, Electron IPC or application stores.

## Install

```bash
pnpm add @eidos.space/eidos-file@1.0.0 \
  @eidos.space/eidos-file-ui@1.0.0 react react-dom
```

Import the precompiled stylesheet once:

```ts
import "@eidos.space/eidos-file-ui/styles.css"
```

First-party full-page hosts use the shared host stylesheet instead. It includes
the component stylesheet plus the canonical Eidos File Tailwind source,
typography, color roles, focus treatment, and scrollbar styling:

```ts
import "@eidos.space/eidos-file-ui/host-styles.css"
```

Application styles should only define Host-owned shell layout after this
import. In the Eidos workspace, Vite hosts also use
`eidosFileUiSourceAliases()` so Web, Lite, and CLI Serve always compile the
current UI source instead of a stale generated `dist` directory.

## EU-Viewer-1.0 composition

```tsx
import { useEffect, useMemo, type ReactNode } from "react"
import type { HostServices } from "@eidos.space/eidos-file"
import {
  EidosFileUIProvider,
  type AssetPresenter,
} from "@eidos.space/eidos-file-ui"
import { EidosUIKernel } from "@eidos.space/eidos-file-ui/kernel"
import {
  EidosStandardView,
  EidosUIRuntimeProvider,
} from "@eidos.space/eidos-file-ui/runtime-platform"

export function Viewer({
  host,
  sourceToken,
  assetPresenter,
}: {
  host: HostServices
  sourceToken: string
  assetPresenter: AssetPresenter<ReactNode>
}) {
  const kernel = useMemo(() => new EidosUIKernel(host), [host])
  useEffect(() => {
    void kernel.openSource({ sourceToken, access: "read" })
    return () => {
      void kernel.close()
    }
  }, [kernel, sourceToken])

  return (
    <EidosFileUIProvider locale="zh" themeName="light">
      <EidosUIRuntimeProvider
        kernel={kernel}
        themeName="light"
        assetPresenter={assetPresenter}
      >
        <EidosStandardView />
      </EidosUIRuntimeProvider>
    </EidosFileUIProvider>
  )
}
```

`EidosFileUIProvider` supports `locale="en"` and `locale="zh"`. English is the
default. Hosts can pass `messages` or a `translate` function to override any UI
copy without changing File content. Locale controls presentation only; table,
field, view, option and record names remain data stored in the Eidos File.

`EidosUIKernel` performs Host negotiation, Runtime negotiation, snapshot and
revision-bound schema paging before presentation. It validates capability and
limit descriptors, canonical schema order, File/revision/projection bindings
and columnar row shape. Generated pages are bounded and invalidated on Runtime
revision or epoch replacement. Latest-wins reads use Runtime cancellation.

`EidosStandardView` declares only `EU-Viewer-1.0`. Grid, Gallery and Kanban
consume Runtime query/group results; they do not reproduce filtering,
Formula/Lookup, Relation or grouping semantics locally. Unknown persisted View
types remain accessible as unsupported renderers.

## Shared editor composition

Browser and Desktop products use `EidosFileEditorShell` as the single editor
layout owner. The Shell fixes the hierarchy and placement of View tabs,
Search/Filter/Sort, Fields and field creation, the data canvas, Table tabs and
editor overlays. Hosts supply shared controls and a rendered View as named
slots; they do not reproduce the workbar or field-action layout.

```tsx
<EidosFileEditorShell
  viewTabs={<EidosFileViewTabs {...viewTabs} />}
  queryToolbar={<EidosFileQueryToolbar {...query} />}
  fields={<EidosFileViewFieldsPopover {...fields} />}
  fieldCreator={<EidosFileFieldCreatePopover {...fieldCreator} />}
  sheetTabs={<EidosFileSheetTabs {...sheets} />}
>
  <EidosFileEditorView source={source} table={table} view={view} />
</EidosFileEditorShell>
```

Browser file pickers, Desktop filesystem integration, save/conflict handling,
version history and extension processes remain Host responsibilities. They
enter the shared editor through data-source methods, plugins, capabilities or
explicit Host-owned surfaces.

## Host responsibilities

The product supplies an EA-Host-1.0 `HostServices` implementation. Source,
destination, session, conflict, recovery and asset tokens are opaque. Host owns
permission, publication, CAS/conflict checks, recovery, assets and replacement
Runtime epochs. Dirty close requires an explicit save/discard/cancel decision.

React renderers are trusted application code, not an extension sandbox. Asset
content is obtained only through bounded Host leases and every lease is
released on expiry, surface removal, or close. Relative, `https:`, and
canonical inline image Data URLs all use `HostServices.resolveAsset`; reusable
UI never joins/fetches/navigates `FileEntry.uri` and has no package-global
resolver. Canvas-backed Grid thumbnails additionally use the optional
`AssetPresenter.loadImage`; DOM cards use `renderImage`. Both consume only the
Host-issued lease token and fall back to trusted metadata when unavailable.
identity resolver. SVG and other active content require a Host-isolated
presenter.

New interoperable integrations import `./kernel` and `./runtime-platform`
explicitly and keep all File semantics behind Runtime.
