# Eidos 1.0 implementation boundary

This package implements the frozen four-layer Eidos 1.0 contract. The English
documents in [`docs/specs`](../../docs/specs/README.md) are normative; the
Chinese documents are item-by-item references.

| Layer       | Implementation owner                                        | May depend on                                  | Must not own                               |
| ----------- | ----------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------ |
| File Format | canonical DDL, values and validation in this package        | SQLite 3.45 baseline                           | Host lifecycle or presentation             |
| Runtime     | `Runtime` / `EidosRuntimeService`                           | `ConnectionPort`, Clock, Entropy, Cancellation | paths, handles, publication authority      |
| Adapter     | Connection ports, Adapter transport, product `HostServices` | Runtime factory/service                        | alternate File semantics                   |
| UI          | `EidosUIKernel` and trusted renderers                       | `RuntimeClient`, `HostServices`                | SQL, format decoding, local canonical undo |

## Connection conformance

The reference SQLite implementations expose EA-Connection-1.0 tagged values,
transactions, snapshots, cancellation profiles and limits:

- Browser: `SQLiteWasmConnectionPort`, hosted beside Runtime in a Dedicated
  Worker and reached through Adapter transport.
- Desktop: `BetterSqlite3ConnectionPort`, kept behind the trusted main-process
  composition.
- Electron 43: `NodeSqliteConnectionPort`, using Node 24's built-in
  `node:sqlite` inside an Eidos Lite utility process. It snapshots with
  `DatabaseSync.serialize()` and cancels by terminating the owning process
  because Node does not expose `sqlite3_interrupt()`.

No port exposes SQLite to UI. All run the mandatory SQLite/JSON1/STRICT/
RETURNING/int64/scalar-function probes before Runtime opens a File.

## Runtime conformance

`Runtime.open` verifies Adapter capabilities and File identity. A readwrite
binding additionally verifies Writer structural preconditions. `Runtime.create`
executes the exact File DDL in the Adapter-owned outer transaction and creates
no default Table.

The public service uses Field IDs and logical values only. Reads are columnar
and revision-bound. Cursors are authenticated, stateless keyset boundaries.
Aggregates and groups use exact typed equality/order and deterministic numeric
arithmetic. Writes validate the complete operation before mutation, increment
revision once only when canonical state changes, and report every affected
Table/Row. The prepared-commit transport barrier runs before the outer COMMIT.

Capabilities are truthful. Optional public methods are absent when their bit is
false; a disabled non-optional operation rejects `unsupported`.

## Host and UI composition

Product code implements `HostServices` with opaque source/destination/session
tokens. It owns permission, recovery, CAS publication, conflicts, assets and
Runtime replacement. UI bootstraps by Host negotiation, Runtime negotiation,
snapshot and revision-bound schema paging. It invalidates generated page state
on revision/epoch change and never interprets File storage.

File assets use the same boundary for relative, `https:`, and canonical inline
image Data URLs. Runtime validates the logical object; Host policy supplies the
session asset root, network permission, import placement, bounded lease, and
isolated presenter. UI passes entry IDs only and never fetches or navigates the
canonical URI.

## Interoperability verification

Conformance work must cover the same contract through Browser WASM, Desktop
better-sqlite3, and Electron 43 `node:sqlite`, plus Adapter transport and a mock
Host/UI harness. API reports, fixtures and implementation-facing docs are
generated from the same public surface. Frozen specifications are changed only
for a demonstrated normative defect, never to match an implementation shortcut.
