# `@eidos.space/eidos-file`

Portable Eidos File 1.0 contracts and the reference headless Runtime.

The normative specifications are [`docs/specs`](../../docs/specs/README.md).
Implementations compose in one direction:

```text
Eidos File 1.0 → Eidos Runtime 1.0 → Eidos Adapter 1.0 → Eidos UI 1.0
```

The File is an ordinary SQLite application file. Runtime alone owns format
semantics. Adapters own SQLite execution, transport, persistence and Host
authority. UI receives only `RuntimeClient` and `HostServices`; it never
receives SQL, a database, a path or a native file handle.

## Install

```bash
pnpm add @eidos.space/eidos-file@1.0.0
```

Add `@eidos.space/eidos-file-ui` for the React Viewer binding.

## Exact Runtime binding

`Runtime.create` initializes an empty `ConnectionPort`; `Runtime.open` validates
an existing one. Both return a public service plus a trusted Host-only bridge.

```ts
import {
  Runtime,
  type ConnectionPort,
  type RuntimeEnvironment,
} from "@eidos.space/eidos-file"

const binding = await Runtime.open(
  connection satisfies ConnectionPort,
  environment satisfies RuntimeEnvironment,
  "readwrite",
  { cancellation, deadlineMilliseconds: 30_000 }
)

const negotiated = await binding.service.negotiate(
  { protocol: "eidos-runtime", versions: ["1.0"] },
  { requestId: "negotiate" }
)
```

The service exposes the frozen columnar query, authenticated keyset cursor,
aggregate/group, validation and transactional mutation contracts. Integer
values are decimal strings at public boundaries; JSON Field values are RFC
8785 JCS text strings. Optional undo/events/CSV methods exist exactly when the
matching negotiated capability is true.

## Adapter profiles

- `BetterSqlite3ConnectionPort` in `@eidos.space/eidos-file/better-sqlite3`
  implements the Desktop EA-Connection binding.
- `NodeSqliteConnectionPort` in `@eidos.space/eidos-file/node-sqlite`
  implements the Electron 43 / Node 24 EA-Connection binding without a native
  addon or a Node/Electron ABI rebuild.
- `SQLiteWasmConnectionPort` in `@eidos.space/eidos-file/browser` implements
  the Browser Worker EA-Connection binding using the same conformance contract.
- `AdapterTransportServer` and `AdapterTransportRuntimeClient` implement the
  Eidos Adapter 1.0 structured-clone transport, including sequence binding,
  cancellation, attachment limits and the prepared-commit acknowledgement
  barrier.

The browser-conforming composition keeps SQLite and Runtime in a Dedicated
Worker. Window receives only the transported `RuntimeClient`; SQLite, File
bytes, and trusted Host authority remain outside UI.

## File rules implemented here

- canonical File DDL, `STRICT` user tables and File-owned triggers;
- lowercase hyphenated UUIDv7 identity;
- exact physical naming, rename and conversion behavior;
- canonical date/datetime, JSON, list, File and Relation values;
- File entries limited to confined relative URI-references, absolute `https:`
  URIs, or canonical inline image Data URLs; inline bytes are validated against
  declared media type and size and are capped at 1 MiB;
- virtual Formula, Lookup and inverse-Relation projection;
- revision, no-op mutation, delete policy and cache invalidation semantics;
- cumulative identity/structural/content/semantic/full validation.

Unsupported pre-1.0 draft schemas are rejected rather than guessed or
silently migrated.

Runtime validates File values but grants no fetch, render, filesystem, or
network authority. Relative/HTTPS bytes never enter a hidden SQLite attachment
store. A Host resolves them through session-scoped asset leases; the canonical
Data URL is the sole inline-byte exception and stores bytes once in `uri`.

## Verification

```bash
pnpm --filter @eidos.space/eidos-file typecheck
pnpm --filter @eidos.space/eidos-file typecheck:public
pnpm --filter @eidos.space/eidos-file build
pnpm --filter @eidos.space/eidos-file api:check
```

The package is framework-agnostic. React bindings live in
`@eidos.space/eidos-file-ui`.
