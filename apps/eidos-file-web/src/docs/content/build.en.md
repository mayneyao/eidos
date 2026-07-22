# Build with Eidos File 1.0

Eidos 1.0 has four interoperable layers. Implement them in dependency order:

```text
File Format → Runtime → Adapter → UI
```

The frozen English specifications are normative:

- [Eidos File 1.0](https://github.com/mayneyao/eidos/blob/main/docs/specs/eidos-file-1.0.md)
- [Eidos Runtime 1.0](https://github.com/mayneyao/eidos/blob/main/docs/specs/eidos-runtime-1.0.md)
- [Eidos Adapter 1.0](https://github.com/mayneyao/eidos/blob/main/docs/specs/eidos-adapter-1.0.md)
- [Eidos UI 1.0](https://github.com/mayneyao/eidos/blob/main/docs/specs/eidos-ui-1.0.md)

## Install

```bash
pnpm add @eidos.space/eidos-file@1.0.0 \
  @eidos.space/eidos-file-ui@1.0.0 react react-dom
```

Import `@eidos.space/eidos-file-ui/styles.css` once.

## Runtime and Adapter

Give `Runtime.open` or `Runtime.create` an EA-Connection-1.0
`ConnectionPort`. The reference Browser binding is
`SQLiteWasmConnectionPort`; Desktop uses `BetterSqlite3ConnectionPort`.

```ts
import { Runtime, type ConnectionPort } from "@eidos.space/eidos-file"

const { service, hostBridge } = await Runtime.open(
  connection satisfies ConnectionPort,
  environment,
  "readwrite",
  { cancellation, deadlineMilliseconds: 30_000 }
)
```

Only `service` becomes `RuntimeClient`. `hostBridge` stays inside trusted
Adapter/product composition. In browsers, keep Connection and Runtime in a
Dedicated Worker and expose the service through
`AdapterTransportRuntimeClient`; do not send SQLite or raw handles to Window.

Your product implements `HostServices` for opaque source/destination tokens,
permission, save/CAS, conflict, recovery and assets. Host receives the trusted
bridge; UI does not.

## Viewer

```tsx
import { useEffect, useMemo } from "react"
import type { HostServices } from "@eidos.space/eidos-file"
import { EidosFileUIProvider } from "@eidos.space/eidos-file-ui"
import { EidosUIKernel } from "@eidos.space/eidos-file-ui/kernel"
import {
  EidosStandardView,
  EidosUIRuntimeProvider,
} from "@eidos.space/eidos-file-ui/runtime-platform"

function Viewer({
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
    <EidosFileUIProvider locale="en">
      <EidosUIRuntimeProvider kernel={kernel}>
        <EidosStandardView />
      </EidosUIRuntimeProvider>
    </EidosFileUIProvider>
  )
}
```

The kernel negotiates Host and Runtime, then loads a snapshot and its
revision-bound schema before rendering. Grid, Gallery and Kanban consume
columnar Runtime results. They never reproduce File filtering, Formula,
Lookup, Relation, aggregate or grouping semantics.

`EidosFileUIProvider` supports `locale="en"` and `locale="zh"`, plus host
`messages` or `translate` overrides. Locale changes UI copy, accessibility
labels, input affordances, and formatting only. Canonical option names and
user-authored Table, Field, and View names remain File data and are never
translated.

## Required interoperability checks

- run the same Runtime contract over Browser WASM and Desktop better-sqlite3;
- verify tagged values, nested transactions, snapshots, cancellation and
  error mapping at the Connection boundary;
- verify prepared-commit receipts before COMMIT on transported mutations;
- verify snapshot/schema/page cursor binding and revision invalidation in UI;
- treat disabled optional capabilities as absent optional methods, not stubs.
