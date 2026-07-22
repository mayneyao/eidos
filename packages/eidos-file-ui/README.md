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

## EU-Viewer-1.0 composition

```tsx
import { useEffect, useMemo } from "react"
import type { HostServices } from "@eidos.space/eidos-file"
import { EidosFileUIProvider } from "@eidos.space/eidos-file-ui"
import { EidosUIKernel } from "@eidos.space/eidos-file-ui/kernel"
import {
  EidosStandardView,
  EidosUIRuntimeProvider,
} from "@eidos.space/eidos-file-ui/runtime-platform"

export function Viewer({
  host,
  sourceToken,
}: {
  host: HostServices
  sourceToken: string
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
      <EidosUIRuntimeProvider kernel={kernel} themeName="light">
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

## Host responsibilities

The product supplies an EA-Host-1.0 `HostServices` implementation. Source,
destination, session, conflict, recovery and asset tokens are opaque. Host owns
permission, publication, CAS/conflict checks, recovery, assets and replacement
Runtime epochs. Dirty close requires an explicit save/discard/cancel decision.

React renderers are trusted application code, not an extension sandbox. Asset
content is obtained only through bounded Host leases and every lease is
released on close.

New interoperable integrations import `./kernel` and `./runtime-platform`
explicitly and keep all File semantics behind Runtime.
