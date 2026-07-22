# Eidos Adapter 1.0

Status: Final Eidos Standard  
Version: 1.0  
Published: 2026-07-21  
Editor and change controller: Eidos Project  
Canonical language: English

## Abstract

Eidos Adapter is the platform boundary beneath Eidos Runtime. It defines how a
Runtime receives exact SQLite values, how a Host opens and safely publishes an
Eidos File, and how Runtime calls cross a Worker or process boundary. The same
Runtime request must retain the same meaning in a browser, desktop application,
server, or command-line tool.

This specification defines three ports:

1. **ConnectionPort**: an ordered, lossless SQLite execution ABI;
2. **PublicationPort**: source identity, writer leases, recovery, and safe
   publication of a self-contained `.eidos` main database;
3. **Transport Profile**: session, ordering, cancellation, backpressure, and
   error rules across a Worker or process boundary.

It does not define Field, Formula, Lookup, Relation, query, mutation, or UI
meaning. Those belong to Eidos File, Eidos Runtime, and Eidos UI.

## Status of This Document

This is the normative Eidos Adapter 1.0 specification. The key words **MUST**,
**MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD
NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and **OPTIONAL** are
interpreted as BCP 14 terms only when written in capitals, as specified by
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

Examples and notes explicitly marked informative are non-normative. All other
algorithms, tables, defaults, state transitions, port shapes, and conformance
requirements are normative. English is canonical; the Chinese document is an
informative reference.

## 1. Position in the Suite

```text
UI ──calls──────────────► RuntimeClient
UI ──calls──────────────► HostServices
Runtime ──calls─────────► ConnectionPort / environment ports
Adapter composition ────► RuntimeHostBridge
Runtime ──interprets────► Eidos File Format
Adapter ──publishes─────► Eidos File Format
```

Arrows show call/use direction. Runtime calls Adapter-provided ports; trusted
Adapter composition calls `RuntimeHostBridge`. These narrow, separately owned
interfaces give neither Adapter logical semantics nor Runtime platform
authority.

The owning documents are:

- [Eidos File Format 1.0](./eidos-file-1.0.md) for persisted bytes, schema,
  identifiers, and canonical raw values;
- [Eidos Runtime 1.0](./eidos-runtime-1.0.md) for logical values, queries,
  derived evaluation, mutations, logical revision, and public errors;
- this document for SQLite/platform/file/Worker/process behavior;
- [Eidos UI 1.0](./eidos-ui-1.0.md) for consuming RuntimeClient/HostServices,
  interaction, presentation, and accessibility.

An Adapter MUST NOT:

- infer or redefine Field types from SQLite storage classes;
- parse Formula or Lookup definitions except as opaque file content;
- choose query, filter, sort, grouping, conversion, or delete semantics;
- expose driver-specific behavior as Runtime behavior;
- expose a SQLite connection, generated SQL, native handle, path, or canonical
  file write primitive to UI code;
- define Runtime logical semantics or UI interaction state.

Runtime supplies trusted generated SQL to ConnectionPort and File validation
callbacks to PublicationPort. Adapter executes and publishes; it does not
decide what those operations mean.

## 2. Terminology and Token Separation

- **Connection**: one opened SQLite connection and its ConnectionPort state.
- **source**: the scoped storage object from which an Eidos File was read.
- **working database**: the database on which Runtime operates; it may be the
  source or a private copy.
- **working ID**: Adapter-private identity for one recoverable working-database
  incarnation; stable only while crash recovery can prove continuity.
- **publication candidate**: a validated, self-contained SQLite main-database
  byte sequence ready to create or replace a source.
- **source ID**: Adapter-private identity for a storage object; not File ID.
- **content token**: opaque equality token for one observed source byte
  version; not logical revision.
- **writer lease**: Adapter-managed right to attempt publication to one source.
- **logical revision**: `eidos__meta.revision`, owned by Runtime and File.
- **data-version token**: per-Connection opaque cache-invalidation token.
- **request ID**: Transport correlation value with no ordering/content meaning.
- **session ID**: opaque identity for one open Runtime/Host session.
- **epoch**: opaque identity for one Transport instance; changes after
  Worker/process replacement.
- **commit receipt**: a pre-COMMIT Transport record binding one tentative
  changed Runtime result to its request, File ID, and revision transition.
- **owned bytes**: immutable bytes independent of SQLite statement lifetime or
  a sender's mutable buffer.
- **fatal**: a state in which a connection or transport cannot be reused.

| Value              | Owner            | Scope                               | Valid comparison                | MUST NOT be used as        |
| ------------------ | ---------------- | ----------------------------------- | ------------------------------- | -------------------------- |
| File ID            | File             | persisted file lifetime             | UUID equality                   | source/session identity    |
| logical revision   | Runtime/File     | one File ID                         | integer equality/order          | byte digest/lock token     |
| content token      | PublicationPort  | one source session                  | opaque equality                 | logical revision           |
| working ID         | Adapter/Host     | one recoverable working incarnation | opaque equality                 | source/File ID             |
| data-version token | ConnectionPort   | one open Connection                 | opaque equality                 | persisted version          |
| session ID         | Host/Transport   | one open session                    | opaque equality                 | File ID                    |
| epoch              | Transport        | one transport lifetime              | opaque equality                 | logical revision           |
| request ID         | Transport caller | one epoch                           | opaque equality                 | sequence number            |
| commit receipt     | Transport/Host   | one prepared mutation               | exact fields and request digest | proof that COMMIT occurred |

## 3. Conformance Profiles and Prerequisites

| Label               | Required ports and prerequisites                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `EA-Connection-1.0` | ConnectionPort, SQLite 3.45.0 or later, Section 4 probes                                                                       |
| `EA-Host-1.0`       | `EA-Connection-1.0`, PublicationPort, integration with an `EF-Reader-1.0` validator                                            |
| `EA-Browser-1.0`    | `EA-Connection-1.0`, `EA-Host-1.0`, Transport Profile, Dedicated Worker, SQLite/WASM, baseline memory/import-export subprofile |
| `EA-Desktop-1.0`    | `EA-Connection-1.0`, `EA-Host-1.0`, Transport Profile, native SQLite, dedicated database Worker thread or process              |

Runtime conformance is not a prerequisite for an Adapter label; Adapter
conformance is tested with a conforming reference Runtime. An assembled tool
separately claims its `EF-*`, `ER-*`, `EA-*`, and `EU-*` labels.

A read-only `EA-Host-1.0` integrates an `EF-Reader-1.0` validator. A read-write
`EA-Host-1.0` MUST additionally integrate an `EF-Writer-1.0` publication
validator. Browser/Desktop Adapter tests MAY supply the reference validator;
the Adapter still does not acquire File semantics.

Every conformance statement MUST publish a machine-readable capability record
and state `read-only` or `read-write`. `read-write` satisfies `read-only`.
Browser and Desktop profiles MUST provide a read-write working database even
when the original source is read-only; they MAY require Save Copy.

```json
{
  "adapterVersion": "1.0",
  "profiles": ["EA-Connection-1.0", "EA-Host-1.0"],
  "access": "read-write",
  "sqliteVersion": "3.45.0",
  "connection": {
    "json1": true,
    "returning": true,
    "strict": true,
    "int64": true,
    "scalarFunctions": true,
    "directOnlyFunctions": true,
    "interrupt": true,
    "snapshot": true,
    "defensiveMode": true,
    "busyTimeoutMs": 5000,
    "maxVariables": 32766,
    "maxSqlBytes": 1000000000,
    "maxValueBytes": 1000000000,
    "maxResultRows": 100000,
    "maxResultBytes": 16777216
  },
  "publication": {
    "writeCurrent": true,
    "saveCopy": true,
    "requestPermission": true,
    "recovery": true,
    "casGuarantee": "strong",
    "writerLease": "exclusive",
    "atomicReplace": true,
    "durability": "durable",
    "assetReadSchemes": ["relative"],
    "assetWriteSchemes": ["relative"]
  },
  "publicationLimits": {
    "sourceBytesMax": "10737418240",
    "candidateBytesMax": "10737418240",
    "recoveryBytesMax": "21474836480",
    "recoveryEntriesMax": 16,
    "recoveryRetentionSecondsMax": 604800,
    "assetBytesMax": "1073741824",
    "assetPreviewBytesMax": "67108864",
    "concurrentAssetLeasesMax": 16
  }
}
```

Values above are examples, not required maxima. A capability describes probed
behavior, not an untested code path. A caller MUST stay within advertised
limits.

## 4. SQLite Baseline and Open-Time Probes

### 4.1 Required baseline

ConnectionPort MUST use SQLite 3.45.0 or later, matching File Format. It MUST
support UTF-8 databases, exact signed int64, finite IEEE 754 binary64 REAL,
required JSON SQL functions, STRICT tables, `RETURNING`, foreign-key
enforcement, `trusted_schema` control, deterministic scalar functions,
transactions, and nested savepoints.

### 4.2 Mandatory probes

Before giving a Connection to Runtime, Adapter MUST run equivalent probes on
that exact connection. Probe objects MUST be TEMP objects or rolled back and
MUST NOT modify canonical state.

```sql
PRAGMA foreign_keys = ON;
PRAGMA trusted_schema = OFF;
SELECT sqlite_version() AS version,
       sqlite_source_id() AS source_id;
SELECT json_valid('[]') AS valid_json,
       json_array_length('[1,2]') AS json_length;
PRAGMA foreign_keys;
PRAGMA trusted_schema;
SELECT CAST('-9223372036854775808' AS INTEGER) AS int64_min,
       CAST('9223372036854775807' AS INTEGER) AS int64_max,
       CAST(X'000102FF' AS BLOB) AS probe_blob;
```

Inside a probe transaction:

```sql
CREATE TEMP TABLE eidos_adapter_probe(
  id INTEGER PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
INSERT INTO eidos_adapter_probe(value)
VALUES ('ok')
RETURNING id, value;
DROP TABLE eidos_adapter_probe;
```

Adapter MUST verify, not merely prepare: version at least 3.45.0 and non-empty
source ID; JSON results
`1` and `2`; `foreign_keys=1`; `trusted_schema=0`; exact int64 boundaries;
byte-exact BLOB including zero; STRICT creation; ordered `RETURNING`; and all
five SQLite storage classes through a registered scalar. Compile-option text
alone is not proof. Failure is `unsupported-capability`; Adapter closes the
Connection and never gives it to Runtime.

## 5. ConnectionPort

### 5.1 Tagged value ABI

This language-neutral IDL is normative. An in-process binding MAY use an
equivalent native tagged union.

```text
SqlValue =
  | { tag: "null" }
  | { tag: "integer", value: Int64Decimal }
  | { tag: "real", value: FiniteBinary64 }
  | { tag: "text", value: UnicodeString }
  | { tag: "blob", value: OwnedBytes }

Int64Decimal = "0" | "-"? [1-9] [0-9]*
```

`Int64Decimal` MUST be in `-9223372036854775808..9223372036854775807`.
Leading `+`, leading zeroes, `-0`, exponent notation, and whitespace are
invalid. This is the only transport-neutral ConnectionPort INTEGER form. A
binding MAY use native int64/BigInt internally but MUST NOT expose unsafe
binary64 Number as INTEGER.

`FiniteBinary64` is finite. NaN and infinities are rejected on bind and cause
`invalid-sql-value` on read. INTEGER and REAL are different tags even when
numerically equal. TEXT is valid Unicode decoded from UTF-8 without
normalization; invalid UTF-8 is an error, never replacement. BLOB result bytes
are copied before step/reset/finalize and owned by the result. Input BLOB is
copied or fully consumed synchronously so later caller mutation is invisible.
SQLite's official APIs define storage classes and buffer lifetimes
([binding](https://www.sqlite.org/c3ref/bind_blob.html),
[results](https://www.sqlite.org/c3ref/column_blob.html)).

Adapter MUST inspect the original storage class before extraction and MUST
NOT ask SQLite to coerce it. NULL, INTEGER, REAL, TEXT, and BLOB stay distinct.

### 5.2 Ordered results

```text
Column = { name: UnicodeString }
QueryResult = { columns: Column[], rows: SqlValue[][] }
```

Each row length equals `columns.length`; order equals SQLite result order.
Duplicate and empty names are preserved. Object/map rows are forbidden as the
primary ABI because they lose duplicate names and can reorder keys.
Runtime-generated SQL explicitly aliases every projected expression because
SQLite does not guarantee an unaliased expression's name
([column-name API](https://www.sqlite.org/c3ref/column_name.html)).

Required transcript:

```sql
SELECT 1 AS x, 2 AS x;
```

```json
{
  "columns": [{ "name": "x" }, { "name": "x" }],
  "rows": [
    [
      { "tag": "integer", "value": "1" },
      { "tag": "integer", "value": "2" }
    ]
  ]
}
```

### 5.3 Operations

```text
ConnectionCapabilities = {
  adapterVersion: "1.0",
  sqliteVersion: UnicodeString,
  json1: Boolean,
  returning: Boolean,
  strict: Boolean,
  int64: Boolean,
  scalarFunctions: Boolean,
  directOnlyFunctions: Boolean,
  interrupt: Boolean,
  snapshot: true,
  defensiveMode: Boolean,
  busyTimeoutMs: PositiveSafeInteger,
  maxVariables: PositiveSafeInteger,
  maxSqlBytes: PositiveSafeInteger,
  maxValueBytes: PositiveSafeInteger,
  maxResultRows: PositiveSafeInteger,
  maxResultBytes: PositiveSafeInteger
}
```

All members are present and reflect probed/enforced behavior. `json1`,
`returning`, `strict`, `int64`, `scalarFunctions`, and `snapshot` are true.
`interrupt`
may be false only when the declared terminate cancellation profile is used;
`directOnlyFunctions` and `defensiveMode` may be false only with the exact
fallbacks in Sections 5.5 and 6. SQLite version is its dotted runtime version
and is at least 3.45.0. Result limits count rows and the exact tagged value ABI
payload before returning any row.

```text
capabilities() -> ConnectionCapabilities
execSchema(sql) -> void
query(sql, bindings = []) -> QueryResult
get(sql, bindings = []) -> { columns, row: SqlValue[] | null }
run(sql, bindings = []) -> RunResult
runMany(sql, bindingSets) -> RunResult[]
registerScalar(definition, function) -> void
transaction(mode, operation) -> T
dataVersion() -> OpaqueToken
interrupt() -> void
snapshot(context) -> Promise<ConnectionSnapshot>
close() -> void
```

The snapshot operation context is:

```text
SnapshotContext = {
  cancellation: CancellationPort,
  deadlineMilliseconds?: PositiveSafeInteger,
  maxBytes: NonNegativeInt64Decimal
}

ConnectionSnapshot = {
  bytes: ByteSource,
  release() -> Promise<void>
}
```

`snapshot` is the only ConnectionPort operation that creates a complete
database image. It MUST be invoked inside an Adapter outer `read` transaction,
after a read from the `main` schema has established that transaction's SQLite
snapshot and with no statement left active. Calling it outside that state is
`invalid-argument`. It returns immutable, independently owned bytes for the
`main` database as observed by reads in that exact transaction. A commit by
another connection after the establishing read MUST NOT appear in the bytes.
TEMP and attached schemas are excluded. `ByteSource` is the immutable,
int64-sized streaming interface from Section 7.1. It remains readable after
the enclosing read transaction ends and until `release` resolves; therefore
Adapter MUST finish an independent backup/frozen image before `snapshot`
resolves and MUST NOT implement the returned source as a view of the live
Connection.

The returned bytes MUST open by themselves as one SQLite main database and
MUST contain every committed page needed for that snapshot. They MUST NOT
depend on a rollback journal, WAL, shared-memory file, VFS metadata, lock file,
or other content outside the byte sequence. Adapter MAY keep that immutable
sequence in Host-private temporary backing storage until `release`; the
published file never depends on that backing. Adapter MAY implement this contract with the Online
Backup API into a fresh database, `sqlite3_serialize` where its observed
snapshot behavior satisfies this contract, or an equivalent VFS facility; it
MUST NOT implement it by copying a live main file while committed pages remain
only in a sidecar. Snapshot creation is read-only with respect to the source
Connection.

Adapter accounts bytes while constructing the frozen image and MUST stop,
release partial backing state, and return `resource-limit` as soon as the
complete image cannot fit `maxBytes`; it never first creates an unbounded
snapshot. Host supplies its effective `candidateBytesMax`. Adapter also checks
cancellation/deadline before work and between bounded backup/serialization
steps. Success after the
complete frozen image exists wins a later cancellation. Any failure leaves the
enclosing read transaction usable for rollback/close; inability to prove that
state is fatal. `release` is asynchronous, idempotent, invalidates future
`ByteSource.read` calls with `adapter-closed`, and removes its private backing
storage. Connection `close` releases every unreleased ConnectionSnapshot.

These are not a public arbitrary-SQL API. Only trusted Runtime and File
validator code receive the port.

Bindings are a positional array for exactly `?1.. ?N`; each index is present
once. Missing, extra, named, or out-of-range bindings are `invalid-argument`.
Values bind by exact tag. Identifiers are never bindings; Runtime owns quoting.

`execSchema` accepts one or more trusted no-result statements, without implicit
begin/commit. `query` accepts exactly one statement that produces rows and
never silently truncates. A mutating statement with `RETURNING` MUST be inside
Runtime's `transaction("write", ...)`; ordinary reads need not be.
`get` returns the first row or null and finishes/finalizes the statement.
`run` accepts one no-result statement and returns:

```text
RunResult = { changes: Int64Decimal, lastInsertRowid: Int64Decimal }
```

`changes` is the statement count. `lastInsertRowid` is never Eidos Row ID.
`runMany` prepares once, executes binding sets in order, returns one result per
set, starts no transaction, and stops on first failure. Earlier effects are
controlled by the enclosing transaction. All statements finalize on every
exit; no driver object or statement-backed pointer escapes.

### 5.4 Transactions and savepoints

`mode` is exactly `read` or `write`. An outer read transaction executes `BEGIN
DEFERRED`, establishes one SQLite snapshot at its first read, and MUST reject
every non-read-only prepared statement with `read-only`. An outer write
transaction executes `BEGIN IMMEDIATE`. Both execute `COMMIT` on success and
`ROLLBACK` after any throw/cancel. SQLite defines the underlying behavior in
its [transaction documentation](https://www.sqlite.org/lang_transaction.html).

Adapter MUST enforce read-only mode with
[`sqlite3_stmt_readonly`](https://www.sqlite.org/c3ref/stmt_readonly.html), an
equivalent authorizer, or a binding mechanism with identical behavior. Method
name is insufficient: a mutating statement passed to `query` is still a write.
`PRAGMA query_only` MAY be defense in depth but is not the sole check.

Nested calls use collision-proof Adapter-private savepoints:

```text
SAVEPOINT <private-name>;
-- nested operation
RELEASE <private-name>;
```

Failure executes `ROLLBACK TO <private-name>; RELEASE <private-name>;`.
Nested calls inherit the outer effective mode. `read` inside `write` is
allowed and remains a write transaction; `write` inside `read` is rejected as
`read-only` before executing SQL. There is no read-to-write escalation. Nested
success is not durable until outer COMMIT
([savepoint semantics](https://www.sqlite.org/lang_savepoint.html)). Depth is
per Connection. Adapter never retries a partially run callback. No unrelated
request interleaves within the transaction, even behind an async facade.

### 5.5 Deterministic scalar functions

```text
ScalarDefinition = {
  name: ASCIIIdentifier,
  arity: Integer(0..127),
  deterministic: true,
  directOnly: true
}
```

Variadic functions are outside 1.0. The function consumes/returns `SqlValue`,
is pure and deterministic, does no file/network/UI access or SQL re-entry, and
maps a throw to `sql-function-error`. Adapter registers it on every relevant
Connection with SQLite deterministic and, where exposed, `DIRECTONLY` flags.
If direct-only is unavailable, report `directOnlyFunctions=false`, retain
`trusted_schema=OFF`, and forbid canonical schema invocation. SQLite defines
these flags in
[`sqlite3_create_function`](https://www.sqlite.org/c3ref/create_function.html).
Runtime owns function names/meaning; Adapter never substitutes locale, clock,
randomness, or host-language coercion.

### 5.6 Data-version token

`dataVersion()` yields an opaque token comparable only for equality with
tokens from the same open Connection. It MUST change before the next Runtime
request after this Connection commits an outer mutation or another connection
commits a visible change. Adapter SHOULD combine a private local-commit counter
with `PRAGMA data_version`, whose SQLite value is connection-local and mainly
reflects other connections
([official definition](https://www.sqlite.org/pragma.html#pragma_data_version)).

The token need not be numeric, ordered, stable after reopen, or persistable.
It is never logical revision/content token. External source replacement closes
the Connection and creates a new session.

### 5.7 Busy, cancellation, close

Default busy timeout is **5,000 ms**; Adapter reports the effective value. A
shorter request deadline controls. Waiting/retry is allowed before statement
effect, but Adapter MUST NOT wait indefinitely, replay a partially executed
transaction, retry constraints/corruption/I/O/cancel, or hide
`SQLITE_BUSY_SNAPSHOT`. Expiry maps to `busy`; `locked` remains distinct and
includes actual SQLite primary/extended codes.

`interrupt=true` only when Adapter can safely perform `sqlite3_interrupt()` on
the active connection, with the official
[interrupt semantics](https://www.sqlite.org/c3ref/interrupt.html). Queued
cancel executes no SQL. Active cancel interrupts, maps to `cancelled` or
`deadline-exceeded`, and rolls back before reuse. A COMMIT linearized first
remains successful. `EA-Connection` may report false, but Browser/Desktop then
MUST hard-cancel by terminating the dedicated Worker/process; that session is
fatal and must reopen. Calling `interrupt()` when the capability is false
returns `unsupported-capability` and MUST NOT pretend the active operation was
cancelled.

```text
opening -> open -> draining -> closed
             |         |
             +-------> fatal
```

`close` is idempotent: reject new work, settle/cancel queued work, roll back if
possible, finalize, release locks/functions, close SQLite. Only repeated close
works after closed/fatal. Corruption, failed rollback, unknown commit outcome,
driver misuse, or process loss is fatal and the Connection is never pooled.

### 5.8 Injected Runtime environment inputs

Alongside ConnectionPort, Adapter supplies Runtime's abstract environment port
with these inputs. They are not a fourth core Adapter port and are never global
ambient APIs:

```text
ClockPort = {
  nowInstant() -> CanonicalMillisecondUTCInstant,
  nowMilliseconds() -> NonNegativeFiniteBinary64
}

EntropyPort = {
  randomBytes(length) -> OwnedBytes
}

RuntimeEnvironment = {
  clock: ClockPort,
  entropy: EntropyPort,
  transportCommitBarrier?: TransportCommitBarrier
}

CancellationPort = {
  cancelled() -> Boolean,
  onCancel(callback) -> Unsubscribe
}
```

Wall clock returns the File Format's exact millisecond UTC instant
`YYYY-MM-DDTHH:MM:SS.sssZ`. Runtime uses it only for canonical timestamps and
the timestamp portion of UUIDv7 generation. It MAY move backward because the
system clock was corrected; Runtime's UUIDv7 monotonic generation rule handles
same/backward millisecond input without changing the timestamp value used for
ordinary timestamp Fields.

Monotonic clock has an arbitrary origin, never decreases during one Adapter
epoch, and is used only for deadlines, busy budgets, and elapsed time. It MUST
NOT be persisted, serialized, used as wall time, or used as a File revision.

Entropy returns exactly the requested number of independently generated,
cryptographically secure bytes and transfers ownership to Runtime. Production
implementations MUST use an operating-system or Web Crypto secure random
source such as
[`crypto.getRandomValues`](https://www.w3.org/TR/WebCryptoAPI/#Crypto-method-getRandomValues),
never `Math.random` or a timestamp-derived PRNG. Runtime owns UUIDv7 allocation,
bit layout, validation, and public creation semantics under
[RFC 9562](https://www.rfc-editor.org/rfc/rfc9562); Adapter only supplies time
and entropy. Explicit caller IDs are a Runtime import/replay feature, not a UI
or Adapter implementation of UUID semantics.

Each in-process Runtime request receives a one-shot, idempotent
CancellationPort. Its transition has the same queued/running/commit boundary
as Transport cancel. Adapter connects it to Connection interrupt or hard
termination and unregisters callbacks at settlement.

`transportCommitBarrier` is present exactly when the Runtime binding is served
through Section 9.5.1's prepared-commit Transport profile and is absent from a
direct binding. It is trusted composition state, not a public service,
canonical File state, or ambient API.

No locale, local timezone, host-language `Date` object, platform clock object,
or mutable random generator crosses this boundary. A conformance harness MAY
inject fixed instants, monotonic readings, entropy bytes, and cancellation
points. Production and test providers use the same interface.

## 6. Secure Connection Bootstrap

Before validation or Runtime SQL, Adapter MUST:

1. open only Adapter-scoped storage in requested read-only/read-write mode;
2. reject SQLite URI parameters not created by Adapter;
3. disable extension loading;
4. enable extended result codes where supported;
5. set and verify `PRAGMA foreign_keys=ON`;
6. set and verify `PRAGMA trusted_schema=OFF`;
7. enable `SQLITE_DBCONFIG_DEFENSIVE` where available;
8. apply busy timeout and resource limits;
9. run Section 4 probes;
10. run File validation before any canonical write, except that creation of a
    new empty database may install the exact File DDL and singleton inside one
    write transaction and validate before that transaction commits.

SQLite defines defensive mode
[here](https://www.sqlite.org/c3ref/c_dbconfig_defensive.html). An Adapter
without that API may conform only if it reports `defensiveMode=false`, exposes
no arbitrary SQL, keeps trusted schema off, and enforces prohibitions with an
authorizer, binding controls, or closed internal APIs.

Untrusted callers MUST NOT receive extension loading, `ATTACH`/`DETACH`,
`writable_schema`, arbitrary PRAGMA, arbitrary metadata DDL/triggers,
ConnectionPort, or scalar registration. Read-only connections also use engine
read-only open mode and SHOULD use `query_only`; PRAGMA alone is insufficient.
Journal mode is working-state policy. WAL/rollback/VFS is allowed internally,
but publication must satisfy Section 8.

## 7. PublicationPort

### 7.1 Port shape

PublicationPort is async and capability-bearing. Every async operation
receives the displayed trailing `PublicationContext={cancellation:
CancellationPort,deadlineMilliseconds?:PositiveSafeInteger}` argument:

```text
openSource(opaqueGrant, desiredAccess, context) -> PublicationSession

PublicationSession:
  capabilities() -> PublicationCapabilities
  limits() -> PublicationLimits
  descriptor() -> SourceDescriptor
  readSource(expectedContentToken?, context) -> SourceSnapshot
  acquireWriterLease(context) -> WriterLease
  publish(candidate, expectedContentToken, writerLease, context) -> PublishResult
  saveCopy(opaqueDestinationGrant, candidate, destinationExpectation, context) -> PublishResult
  saveRecovery(recoveryRecord, context) -> RecoveryID
  listRecovery(context) -> RecoveryDescriptor[]
  readRecovery(recoveryID, context) -> RecoveryRecord
  discardRecovery(recoveryID, context) -> void
  acquireAsset(assetReference, mode, context) -> PublicationAssetLease
  resolveAsset(assetLease, context) -> { descriptor: AssetDescriptor, bytes: ByteSource }
  releaseAsset(assetLease, context) -> void
  close(context) -> void
```

`capabilities`, `limits`, and `descriptor` are synchronous immutable snapshots
for the session. Every other arrow above is asynchronous and has exactly one
settlement.

`opaqueGrant` comes from a trusted platform/product composition layer. UI may
hold an opaque grant token but MUST NOT receive a path, native handle, storage
credential, PublicationPort, or source bytes.

`desiredAccess` is exactly `read` or `readwrite`. Core publication types are:

```text
WriterLease = {
  leaseID: OpaqueString,
  sourceID: OpaqueString,
  level: "exclusive" | "cooperative",
  ttlMs?: PositiveSafeInteger
}

PublicationCandidate = {
  fileID: UUIDv7,
  logicalRevision: NonNegativeInt64Decimal,
  digest: LowercaseSHA256Hex,
  size: NonNegativeInt64Decimal,
  bytes: ByteSource
}

PublishResult = {
  descriptor: SourceDescriptor,
  fileID: UUIDv7,
  logicalRevision: NonNegativeInt64Decimal,
  digest: LowercaseSHA256Hex,
  durability: "durable" | "best-effort"
}

DestinationExpectation =
  | { mode: "create-only" }
  | { mode: "replace", sourceID: OpaqueString,
      contentToken: OpaqueToken }

PublicationCapabilities = {
  writeCurrent: Boolean,
  saveCopy: Boolean,
  requestPermission: Boolean,
  recovery: Boolean,
  casGuarantee: "strong" | "cooperative" | "none",
  writerLease: "exclusive" | "cooperative" | "none",
  atomicReplace: Boolean,
  durability: "durable" | "best-effort",
  assetReadSchemes: UnicodeString[],
  assetWriteSchemes: UnicodeString[]
}

PublicationLimits = {
  sourceBytesMax: NonNegativeInt64Decimal,
  candidateBytesMax: NonNegativeInt64Decimal,
  recoveryBytesMax: NonNegativeInt64Decimal,
  recoveryEntriesMax: NonNegativeSafeInteger,
  recoveryRetentionSecondsMax: NonNegativeSafeInteger,
  assetBytesMax: NonNegativeInt64Decimal,
  assetPreviewBytesMax: NonNegativeInt64Decimal,
  concurrentAssetLeasesMax: NonNegativeSafeInteger
}
```

`LowercaseSHA256Hex` is exactly 64 lowercase hexadecimal characters for
SHA-256 as defined by [NIST FIPS 180-4](https://doi.org/10.6028/NIST.FIPS.180-4),
over all candidate bytes. `size` equals ByteSource size. File ID/revision equal the
validated candidate metadata. A lease is valid only for its source/session,
declared level, and unexpired lifetime. `ttlMs`, when present, starts at lease
acquisition and is measured by the injected monotonic clock. Adapter rejects
any mismatch as `writer-unavailable` before writing.

```text
SourceDescriptor = {
  sourceID: OpaqueString,
  displayName: UnicodeString,
  size: NonNegativeInt64Decimal,
  contentToken: OpaqueToken,
  lastModified?: CanonicalInstant,
  permission: "granted" | "prompt" | "denied" | "unavailable"
}
```

Every capability/limit member is present. Scheme arrays contain unique
lowercase RFC 3986 scheme names in `BINARY` order. Zero publication limits
disable the corresponding optional operation and never truncate. Zero never
means unlimited. In particular, `recoveryRetentionSecondsMax=0` disables
recovery; it means neither immediate expiry nor absence of time-based expiry.
Recovery is available only when `recovery=true` and each of
`recoveryBytesMax`, `recoveryEntriesMax`, and
`recoveryRetentionSecondsMax` is positive. Because Section 8.6 requires
recovery for writable Host operation, an `EA-Host-1.0` session with any of
those three limits zero MUST NOT expose a read-write Runtime.

The remaining exact records are:

```text
PublicationContext = {
  cancellation: CancellationPort,
  deadlineMilliseconds?: PositiveSafeInteger
}

AssetReference =
  | { kind: "uri", uri: UnicodeString }
  | { kind: "grant", token: OpaqueString }

ByteSource = {
  size: NonNegativeInt64Decimal,
  read(offset: NonNegativeInt64Decimal,
       length: NonNegativeSafeInteger,
       context: PublicationContext) -> OwnedBytes
}

SourceSnapshot = {
  descriptor: SourceDescriptor,
  bytes: ByteSource,
  release() -> Promise<void>
}

RecoveryRecord = {
  fileID: UUIDv7,
  logicalRevision: NonNegativeInt64Decimal,
  digest: LowercaseSHA256Hex,
  size: NonNegativeInt64Decimal,
  createdAt: CanonicalInstant,
  sourceID?: OpaqueString,
  baseContentToken?: OpaqueToken,
  bytes: ByteSource
}

RecoveryDescriptor = {
  recoveryID: OpaqueString,
  fileID: UUIDv7,
  logicalRevision: NonNegativeInt64Decimal,
  digest: LowercaseSHA256Hex,
  size: NonNegativeInt64Decimal,
  createdAt: CanonicalInstant
}

PublicationAssetLease = {
  leaseID: OpaqueString,
  mode: "read" | "import" | "write",
  expiresAt: CanonicalInstant
}

AssetDescriptor = {
  mediaType: UnicodeString,
  name: UnicodeString,
  size: NonNegativeInt64Decimal
}
```

`ByteSource` is immutable for its owning record/lease lifetime. Read requires `offset<=size`; it returns exactly
`min(length,size-offset)` owned bytes, including zero at EOF, and never aliases
a mutable/native/WASM buffer. A SourceSnapshot descriptor and bytes describe
the same token. At most one SourceSnapshot is live per PublicationSession;
Host calls its asynchronous idempotent `release` in `finally` after importing
or validating the source. Release invalidates later reads with
`adapter-closed` and removes private backing; another `readSource` before
release is `busy`. Session close releases an orphaned snapshot.
Recovery digest/size match its bytes. `readRecovery` returns
the exact saved record. `acquireAsset` returns `PublicationAssetLease`;
`resolveAsset` returns `{descriptor:AssetDescriptor,bytes:ByteSource}`. A
change during source read is `source-changed`; mixed bytes are forbidden.
`listRecovery` is ordered by `createdAt` descending, then `recoveryID` by
`BINARY` ascending, and never returns more than `recoveryEntriesMax`.

`ConnectionSnapshot.release`, `SourceSnapshot.release`, and the delegated
`RuntimePublicationSnapshot.release` are no-argument cleanup primitives. They
are intentionally not cancellable and always finish resource release; this is
not an omission of `PublicationContext` from ordinary async work.

`assetReference` is either an authorized canonical URI or a Host-resolved
opaque source grant; `mode` is `read`, `import`, or `write`. UI supplies neither
form directly. A composition facade resolves its opaque `sourceToken` or
Runtime File-entry ID before calling PublicationPort.

Cancellation is mandatory. Before any source/destination replacement starts,
cancel/deadline aborts with `cancelled`/`deadline-exceeded` and leaves source
bytes unchanged. Once replacement starts, Adapter defers cancellation until it
has verified success or established `recovery-required`; it returns that known
outcome rather than falsely claiming cancellation. Read/open/asset operations
stop at bounded read boundaries and release partial private buffers. Close
cancellation never skips lease/handle cleanup.

### 7.2 Source identity and content token

`sourceID` identifies the storage object within Adapter scope. It SHOULD
survive rename when object identity is provable, and MUST change when a handle
or path designates a detected replacement. Path text alone is insufficient.

`contentToken` is opaque, scoped to sourceID plus open session, and MUST change
whenever Adapter observes different bytes. Within that scope, identical bytes
for the same source identity MUST return an equal token and different bytes
MUST return an unequal token. It MAY be a digest or platform
version plus digest. Only equality is defined; callers never parse/order it,
persist it as logical revision, or compare across sources. File watchers and
timestamps are hints. Ordinary publication always revalidates a current token
through the same identity path used for replacement.

### 7.3 Read-only and permission

If write permission, safe lease, or conforming publication is unavailable,
Adapter MUST open the source read-only. It MAY still expose a read-write
private working database and `saveCopy=true`.

Permission states are observations. `prompt` MUST NOT trigger a background
prompt. A user-activated composition action may request permission and replace
the opaque grant. Denial is `permission-denied` and preserves working data and
recovery.

### 7.4 Writer lease and CAS

Publication capabilities declare one lease level:

| `writerLease` | Guarantee                                                                             |
| ------------- | ------------------------------------------------------------------------------------- |
| `exclusive`   | platform lock excludes writers honoring that storage lock through compare and replace |
| `cooperative` | Host-private lease excludes conforming Eidos Adapters; external writers may race      |
| `none`        | no writer exclusion                                                                   |

The returned lease is session-scoped and non-transferable. One Worker/process
may hold the source publication lease. Separately, one session may be the
logical Runtime writer for a working file. SQLite locking is still required.
Ordinary overwrite requires `exclusive` or `cooperative`.
With `none`, only read-only operation or explicit Save Copy is allowed. Forced
overwrite is not an Adapter 1.0 PublicationPort operation and is never an
automatic conflict fallback.

Capabilities also declare:

| `casGuarantee` | Required behavior                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `strong`       | expected-token comparison and replacement share one linearization point under exclusive storage lock                      |
| `cooperative`  | token is rechecked under Eidos lease immediately before replacement; conforming writers cannot race, external writers may |
| `none`         | no conditional overwrite; ordinary overwrite forbidden                                                                    |

`publish` requires the base snapshot token. Mismatch returns `source-changed`
before writing and preserves candidate/recovery. Adapter never silently reloads,
merges, forces, or selects a winner. Merge belongs to Runtime/product code.
After cooperative publication, Adapter rereads and verifies candidate digest;
a difference is conflict/publication failure and recovery remains.

### 7.5 Host state machine

For every read-write Transport session, trusted Host—not Runtime—MUST enforce
one exclusive logical writer for the working database. It assigns a fresh
opaque `workingID` when creating/importing a working incarnation and preserves
that value across Worker/process replacement only when it can prove the same
crash-recovered database continues. Filename, source ID, and File ID alone are
not continuity proof. The writable working store MUST be scoped
so non-Adapter connections/processes cannot perform canonical writes. If the
opened source cannot provide that exclusion, Host operates Runtime on a
private copy and uses PublicationPort to save; it MUST NOT treat a cooperative
source lease as exclusion from arbitrary SQLite writers. Read-only direct
Connection use is unaffected. This working-writer invariant is separate from
the source publication writer lease in Section 7.4.

```text
opening
  |-> ready-readonly
  `-> ready-clean -> ready-dirty -> publishing -> ready-clean
                         |             |-> conflict
                         |             `-> recovery-required
                         `----------------> conflict

ready-clean/ready-dirty -> commit-unknown
commit-unknown -> ready-clean | ready-dirty | conflict

any non-closed state -> fatal
any state -> closed
```

- `ready-readonly`: the working Runtime itself cannot mutate. It does not mean
  merely that the original source cannot be overwritten.
- `ready-clean`: working logical revision equals its opened/published baseline.
  A writable private working database for a read-only source is ready-clean
  with `canWriteCurrent=false` and normally `canSaveCopy=true`.
- `ready-dirty`: Runtime committed a newer logical revision.
- `publishing`: mutations are quiesced while one frozen candidate revision is
  being validated/published; snapshot-safe reads may continue.
- `conflict`: source identity/token changed; dirty work preserved.
- `recovery-required`: destination outcome/validity is uncertain; verified
  recovery candidate preserved.
- `commit-unknown`: old Transport/Runtime epoch is fatal after an acknowledged
  mutation lost its final outcome; Host retains a private receipt and permits
  only reconciliation, recovery inspection, or close.
- `fatal`: working connection cannot be trusted and must reopen/restore.

Adapter enters dirty only from Runtime-reported successful logical mutation,
never data-version alone; generated-cache writes are not dirty. Only one
publication runs per session.

The exact UI-facing HostServices binding is specified in Section 13. It is a
composition facade, not a fourth low-level port; UI never receives
PublicationPort.

## 8. Producing and Publishing a Candidate

### 8.1 Quiesce and snapshot

Host MUST obtain candidate input only from the trusted Runtime host bridge
`createPublicationSnapshot({maxBytes}, context)`, where `maxBytes` is the
session's effective `candidateBytesMax`. That bridge is not RuntimeClient and is
never exposed to UI. It returns exactly:

```text
RuntimePublicationSnapshot = {
  fileId: UUIDv7,
  revision: NonNegativeInt64Decimal,
  bytes: ByteSource,
  release() -> Promise<void>
}
```

Runtime serializes this bridge call with its public request queue, waits for
every earlier mutation to commit/rollback, blocks every later operation until
the independent ConnectionSnapshot exists, and relies on the Host-enforced
Section 7.5 sole-writer invariant. In one Adapter outer read transaction it:

1. reads File ID/revision from `main`, establishing the SQLite read snapshot;
2. finishes those statements;
3. invokes `ConnectionPort.snapshot` before ending that read transaction;
4. returns the resulting immutable `ByteSource` with exactly those identity
   values.

Host rechecks the source size against effective `candidateBytesMax`, hashes
and runs the File Writer publication validator over that same ByteSource, and
binds the candidate to its File ID, logical revision, byte length, and digest.
It MUST NOT substitute a later Connection image. On every exit it calls the
RuntimePublicationSnapshot's idempotent `release` in a `finally` path after
publication and any required recovery copy no longer need its backing storage.
The bridge retains the underlying ConnectionSnapshot and delegates that call;
UI never receives either release handle. Runtime/Connection close also releases
any snapshot whose Host cleanup did not finish.

Runtime's internal queue need not remain blocked throughout hashing,
validation, or PublicationPort I/O because the returned source is independent.
Trusted Host composition nevertheless keeps its mutation-admission gate closed
until publication settles, so no later canonical revision can overtake the
candidate. A new mutation call during `publishing` fails Runtime `busy` before
execution; snapshot-safe reads MAY continue. On success the gate reopens at
`ready-clean`; on failure it reopens at `ready-dirty`/`conflict`, or remains
closed in `recovery-required`/`fatal` as that state requires.

The PublicationPort source writer lease SHOULD be acquired after candidate
validation and immediately before source-token recheck/replacement, minimizing
lock duration. It is distinct from the session's logical Runtime writer role.

SQLite's [Online Backup API](https://www.sqlite.org/backup.html) is acceptable
when used with its locking rules. If working mode is WAL, copying only the main
file is forbidden. ConnectionPort must use its frozen backup/serialization
contract (or quiesce and checkpoint until no busy frames remain), making main
independent of `-wal`/`-shm`; official
[WAL rules](https://www.sqlite.org/wal.html) apply.

The artifact is exactly one self-contained `.eidos` main database. Journals,
WAL, shared-memory, OPFS VFS metadata, locks, temp files, recovery, and caches
are not File state.

### 8.2 Candidate validation

Immediately before publication, Adapter MUST invoke an `EF-Writer-1.0`
publication validator supplied by the assembled implementation, not reimplement
File semantics. It establishes File-owned identity/schema/`quick_check`/
`foreign_key_check` requirements. Adapter additionally verifies:

- digest covers all candidate bytes;
- no connection can modify those bytes;
- no journal sidecar is required;
- declared and actual byte lengths agree;
- size is within publication limit.

Failure is `publication-failed`; source remains unchanged and working state
dirty.

### 8.3 Safe replacement

Capabilities report:

```text
atomicReplace: true | false
durability: "durable" | "best-effort"
```

With `atomicReplace=true`, Adapter stages in the same replacement domain,
writes all bytes, flushes as the platform permits, atomically replaces, and
flushes containing metadata where possible. After reported failure, source is
all old or all candidate bytes, never mixed.

With `atomicReplace=false`, Adapter MUST atomically save and verify recovery
before touching source, use the strongest commit operation, close, reread, and
compare digest. Write/verification failure enters `recovery-required`; Adapter
does not claim old bytes survived. Recovery stays until restore/Save Copy.

`durable` reports success only after available data and containing-metadata
durability operations. `best-effort` discloses lack of such guarantee. Neither
changes Runtime semantics.

### 8.4 Postconditions

Successful publish or Save Copy means:

1. destination equals candidate digest;
2. reread is a self-contained valid Eidos File;
3. descriptor/token describe those exact bytes;
4. no stale journal is required;
5. recovery is deleted only after 1–4.

For `publish`, the current session base token becomes the returned token and
state becomes `ready-clean` at the candidate revision. `saveCopy` establishes only
the destination descriptor/token and does not alter the current session's
source, base token, or dirty/clean state. A composition layer may explicitly
adopt the copy by closing the old source and opening a new Runtime/Transport
epoch; only that separate successful transition becomes clean on the copy.

On source-change, permission, lease, or any pre-replacement failure, original
source is untouched and candidate stays recoverable. Indeterminate/non-atomic
failure is `recovery-required`, never clean.

Publication-session `close` is idempotent. It releases the writer lease, asset
leases, and source handles, but does not delete recovery records.

### 8.5 Save Copy and external replacement

Save Copy creates or explicitly replaces a selected destination, establishes a
new source identity/token, and publishes identical candidate bytes. Storage
location change alone never changes File ID/logical revision. `create-only`
fails with `source-changed` if an object exists. Replacement requires a fresh
grant plus exact destination identity/content token, rechecked at the same
linearization boundary as Section 7.4; mismatch leaves the destination
untouched. A composition-layer `destinationToken` is one-use and binds this
grant/expectation without exposing either to UI. A composition layer may keep
old source or adopt new source but must say which; Adapter does not silently
close/overwrite old source.

Watcher events trigger identity/token revalidation but are not proof. Clean
sessions may policy-reload via a new Connection and Transport epoch; old
statements/data-version tokens are discarded. Dirty external change enters
conflict and preserves both versions. Safe actions are confirmed discard/reload,
Save Copy, or Runtime/product merge; Adapter never auto-merges.

### 8.6 Recovery

A read-write `EA-Host-1.0` MUST provide Host-private recovery:

```text
HostRecoveryEnvelope = {
  recoveryID, workingID, sourceID, baseDigest, fileID, logicalRevision,
  createdAt,
  payload:
    | { kind: "candidate", candidateDigest, candidateLength, candidateBytes }
    | { kind: "working-snapshot", storageToken }
}
```

`HostRecoveryEnvelope` is an Adapter-private storage model, not the
PublicationPort `RecoveryRecord` in Section 7.1 and never a second port ABI.
`workingID` binds it to the exclusive working incarnation from Section 7.5.
The public `saveRecovery` accepts the Section 7.1 self-contained byte record.
A Host MAY instead create/update a `working-snapshot` through its private
recovery implementation; before `readRecovery` returns it MUST open, validate,
and materialize that snapshot as the exact Section 7.1 `RecoveryRecord` with an
immutable ByteSource. Thus callers observe one record shape regardless of the
storage optimization.

`baseDigest` and candidate digest are `LowercaseSHA256Hex`; they remain usable
after a content token's session scope ends. A `candidate` payload is owned,
self-contained, and valid before it is advertised restorable. A
`working-snapshot` is a transactionally consistent, durable Host-private
SQLite working database referenced by an opaque persistent storage token. It
MAY retain its private VFS journal, but Host MUST open it through SQLite,
validate it before restore, and produce a Section 8 candidate before
publication. The storage token never crosses the composition facade.

Recovery-store update of record plus payload reference MUST be atomic. An older
logical revision cannot replace a newer one for the same source/session. A
non-atomic overwrite specifically requires a `candidate` payload; periodic
autosave MAY use an incrementally durable `working-snapshot`, so conformance
does not require copying the whole database every 30 seconds.

Host saves recovery before non-atomic overwrite; before safe hard termination
of dirty work; after advertised dirty autosave interval; and before discarding
a connection after indeterminate I/O. Default autosave is **30 seconds** while
dirty; products may shorten it or advertise up to 5 minutes. It also checkpoints
after 100 committed logical mutations if earlier.

Recovery survives Worker/process restart and ordinary crash within platform
guarantees. It is deleted only after verified publication, explicit discard,
or disclosed expiry. It never enters `.eidos` canonical state.

### 8.7 Assets

Asset bytes referenced by canonical File-field URIs are outside SQLite bytes.
Capabilities list readable/writable URI schemes. Network is disabled by
default and requires explicit Host policy/permission. `acquireAsset` returns a
scoped lease, not ambient path/network access. Adapter MUST prevent traversal,
symlink/origin escape, credential escalation; enforce byte/time/media limits;
treat media type/filename as untrusted; release handles/object URLs; and never
rewrite canonical URI due only to platform path change.

The capability token `relative` means a File URI without an
[RFC 3986](https://www.rfc-editor.org/rfc/rfc3986) scheme,
such as `assets/diagram.png`, resolved only inside the session's scoped asset
root. Every other token is a lowercase RFC 3986 scheme matching
`[a-z][a-z0-9+.-]*`, for example `https`. `assets` is a path segment, not a
scheme token. Listing `https` or another network scheme is an explicit
capability declaration but still requires per-Host authorization. Writers
normally declare only `relative`.

When one operation changes assets and database, Host stages assets first,
publishes database only after required assets are durable, and retains a
recovery manifest until verified. Failure prefers unreferenced staged assets
over a database referencing missing assets. Cross-resource atomicity is never
claimed without a real platform transaction.

## 9. Transport Profile

### 9.1 Scope

Transport Profile carries the Runtime public service across one dedicated
Worker/process boundary. It is mandatory for Browser/Desktop but has no
separate 1.0 label. One Transport channel carries one document session. A
multi-document product uses one channel/epoch per session or isolation with
observably identical guarantees.

Transport never exposes ConnectionPort/PublicationPort. Runtime owns operation
names and payload semantics; Transport treats them as JSON-compatible typed
data plus explicit byte attachments.

The 1.0 envelope is request/response plus the solicited pre-COMMIT barrier in
Section 9.5.1. It defines no unsolicited Runtime event message. A RuntimeClient
carried by this Transport therefore reports
`events=false` and omits `subscribe`, even when the direct Runtime can emit
events. `HostServices.subscribe` is a separate composition-facade state
channel, not a Runtime Transport envelope. A future event envelope requires a
new Adapter protocol version; implementations MUST NOT invent one under 1.0.

### 9.2 One wire contract

The unique Adapter 1.0 wire contract is the JSON logical envelope defined by
the executable JSON Schema in Section 9.3. JSON payloads MUST validate against
JSON Schema Draft 2020-12 semantics
([Core](https://json-schema.org/draft/2020-12/json-schema-core),
[Validation](https://json-schema.org/draft/2020-12/json-schema-validation)).

Browser structured-clone carrier is exactly:

```text
StructuredCloneCarrier = {
  envelope: AdapterWireEnvelope,
  buffers: ArrayBuffer[]
}
```

`envelope` is first validated by the same executable JSON Schema. The Runtime
endpoint then validates request `operation`/`payload` semantically against
Eidos Runtime's exact tagged API types, and the client validates successful
`result` against those same normative types. Payload/result are deliberately
generic JSON in the Adapter envelope because Runtime owns their meaning; this
is owner separation, not skipped validation. The embedded
`$defs.commitReconciliation` is the executable validation for receipt
reconciliation. All applicable validations MUST pass before their state
transition. `buffers.length` MUST
equal `envelope.attachments.length` (zero when omitted); buffer at index N is
owned content for descriptor N and its `byteLength` MUST match. Every
descriptor ID and `slot` is unique. The owning Runtime operation contract names
the accepted binary slots and receives a separate slot-to-owned-bytes map;
payload JSON is never scanned for attachment markers. Every descriptor MUST be
accepted and consumed exactly once. A failure is `protocol-error` before
Runtime.

In Runtime 1.0 the only nominal `OwnedBytes` member is CSV `csv`.
`CsvImportRequest.csv` is removed, including its key, from the request JSON and
is carried as exactly one request attachment with slot `csv`;
`CsvExportResult.csv` is removed the same way and carried as exactly one
response attachment with slot `csv`. The endpoint/client reconstructs the
required logical member before validating the Runtime request/result. No other
1.0 Runtime operation accepts an attachment slot.

Desktop IPC implements the same envelope/descriptors and owned buffers. A
platform-specific transferable mechanism is allowed only as carrier; it does
not define a second wire shape. Base64-in-payload, native pointers, driver BLOB
objects, and ad-hoc BigInt clone values are not Adapter 1.0 wire values.

### 9.3 Executable envelope schema

The following complete document is the normative Adapter framing and receipt
schema. Runtime payload/result meaning remains governed by Eidos Runtime's
normative API types and algorithms as described above.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://spec.eidos.space/adapter/1.0/wire.schema.json",
  "title": "Eidos Adapter Wire Envelope 1.0",
  "oneOf": [
    { "$ref": "#/$defs/hello" },
    { "$ref": "#/$defs/helloError" },
    { "$ref": "#/$defs/helloResult" },
    { "$ref": "#/$defs/request" },
    { "$ref": "#/$defs/success" },
    { "$ref": "#/$defs/failure" },
    { "$ref": "#/$defs/commitPrepared" },
    { "$ref": "#/$defs/commitAck" },
    { "$ref": "#/$defs/cancel" },
    { "$ref": "#/$defs/close" },
    { "$ref": "#/$defs/closeResult" }
  ],
  "$defs": {
    "opaque": { "type": "string", "minLength": 1, "maxLength": 128 },
    "requestID": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128,
      "pattern": "^[^\\u0000]+$"
    },
    "uuidv7": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "slot": { "type": "string", "pattern": "^[A-Za-z][A-Za-z0-9._-]{0,127}$" },
    "safeInteger": {
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    },
    "nonNegativeInt64": {
      "type": "string",
      "pattern": "^(?:0|[1-9][0-9]{0,17}|[1-8][0-9]{18}|9[01][0-9]{17}|92[01][0-9]{16}|922[0-2][0-9]{15}|9223[0-2][0-9]{14}|92233[0-6][0-9]{13}|922337[01][0-9]{12}|92233720[0-2][0-9]{10}|922337203[0-5][0-9]{9}|9223372036[0-7][0-9]{8}|92233720368[0-4][0-9]{7}|922337203685[0-3][0-9]{6}|9223372036854[0-6][0-9]{5}|92233720368547[0-6][0-9]{4}|922337203685477[0-4][0-9]{3}|9223372036854775[0-7][0-9]{2}|922337203685477580[0-7])$"
    },
    "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "attachment": {
      "type": "object",
      "required": ["id", "slot", "byteLength"],
      "properties": {
        "id": { "$ref": "#/$defs/opaque" },
        "slot": { "$ref": "#/$defs/slot" },
        "byteLength": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        }
      },
      "additionalProperties": false
    },
    "attachments": {
      "type": "array",
      "items": { "$ref": "#/$defs/attachment" },
      "maxItems": 1024
    },
    "limits": {
      "type": "object",
      "required": [
        "maxOutstandingRequests",
        "maxQueuedBytes",
        "maxRequestBytes",
        "maxResponseBytes",
        "defaultTimeoutMs",
        "maxTimeoutMs",
        "commitAckTimeoutMs"
      ],
      "properties": {
        "maxOutstandingRequests": {
          "type": "integer",
          "minimum": 1,
          "maximum": 65536
        },
        "maxQueuedBytes": {
          "type": "integer",
          "minimum": 1048576,
          "maximum": 9007199254740991
        },
        "maxRequestBytes": {
          "type": "integer",
          "minimum": 65536,
          "maximum": 9007199254740991
        },
        "maxResponseBytes": {
          "type": "integer",
          "minimum": 65536,
          "maximum": 9007199254740991
        },
        "defaultTimeoutMs": {
          "type": "integer",
          "minimum": 30000,
          "maximum": 9007199254740991
        },
        "maxTimeoutMs": {
          "type": "integer",
          "minimum": 30000,
          "maximum": 9007199254740991
        },
        "commitAckTimeoutMs": {
          "type": "integer",
          "minimum": 100,
          "maximum": 60000
        }
      },
      "additionalProperties": false
    },
    "adapterErrorCode": {
      "enum": [
        "adapter-closed",
        "invalid-argument",
        "invalid-sql-value",
        "unsupported-capability",
        "sql-error",
        "sql-function-error",
        "constraint",
        "busy",
        "locked",
        "cancelled",
        "deadline-exceeded",
        "resource-limit",
        "out-of-memory",
        "io-error",
        "corrupt",
        "not-a-database",
        "read-only",
        "permission-denied",
        "source-changed",
        "writer-unavailable",
        "publication-failed",
        "recovery-required",
        "asset-unavailable",
        "backpressure",
        "commit-outcome-unknown",
        "protocol-error",
        "transport-closed",
        "transport-fatal"
      ]
    },
    "adapterError": {
      "type": "object",
      "required": ["code", "message", "retryable", "fatal"],
      "properties": {
        "code": { "$ref": "#/$defs/adapterErrorCode" },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 4096,
          "pattern": "^[^\\u0000]+$"
        },
        "retryable": { "type": "boolean" },
        "fatal": { "type": "boolean" },
        "sqlitePrimaryCode": {
          "type": "integer",
          "minimum": 0,
          "maximum": 2147483647
        },
        "sqliteExtendedCode": {
          "type": "integer",
          "minimum": 0,
          "maximum": 2147483647
        },
        "details": true
      },
      "additionalProperties": false,
      "allOf": [
        {
          "if": {
            "required": ["code"],
            "properties": { "code": { "const": "commit-outcome-unknown" } }
          },
          "then": {
            "required": ["details"],
            "properties": {
              "retryable": { "const": false },
              "fatal": { "const": true },
              "details": { "$ref": "#/$defs/unknownCommitDetails" }
            }
          }
        }
      ]
    },
    "commitReconciliation": {
      "oneOf": [
        {
          "type": "object",
          "required": ["operation", "result"],
          "properties": {
            "operation": { "enum": ["mutateRows", "revertMutation"] },
            "result": {
              "type": "object",
              "required": [
                "fileId",
                "revision",
                "changed",
                "created",
                "affectedRows"
              ],
              "properties": {
                "fileId": { "$ref": "#/$defs/uuidv7" },
                "revision": { "$ref": "#/$defs/nonNegativeInt64" },
                "changed": { "const": true },
                "created": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["clientKey", "rowId"],
                    "properties": {
                      "clientKey": { "type": "string", "minLength": 1 },
                      "rowId": { "$ref": "#/$defs/uuidv7" }
                    },
                    "additionalProperties": false
                  }
                },
                "affectedRows": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["tableId", "rowId"],
                    "properties": {
                      "tableId": { "$ref": "#/$defs/uuidv7" },
                      "rowId": { "$ref": "#/$defs/uuidv7" }
                    },
                    "additionalProperties": false
                  },
                  "uniqueItems": true
                }
              },
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        },
        {
          "type": "object",
          "required": ["operation", "result"],
          "properties": {
            "operation": { "const": "mutateView" },
            "result": {
              "type": "object",
              "required": [
                "fileId",
                "revision",
                "changed",
                "createdViews",
                "affectedViewIds"
              ],
              "properties": {
                "fileId": { "$ref": "#/$defs/uuidv7" },
                "revision": { "$ref": "#/$defs/nonNegativeInt64" },
                "changed": { "const": true },
                "createdViews": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["clientKey", "viewId"],
                    "properties": {
                      "clientKey": { "type": "string", "minLength": 1 },
                      "viewId": { "$ref": "#/$defs/uuidv7" }
                    },
                    "additionalProperties": false
                  }
                },
                "affectedViewIds": {
                  "type": "array",
                  "items": { "$ref": "#/$defs/uuidv7" },
                  "uniqueItems": true
                }
              },
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        },
        {
          "type": "object",
          "required": ["operation", "result"],
          "properties": {
            "operation": { "const": "mutateSchema" },
            "result": {
              "type": "object",
              "required": [
                "fileId",
                "revision",
                "changed",
                "createdObjects",
                "affectedTableIds",
                "affectedFieldIds"
              ],
              "properties": {
                "fileId": { "$ref": "#/$defs/uuidv7" },
                "revision": { "$ref": "#/$defs/nonNegativeInt64" },
                "changed": { "const": true },
                "createdObjects": {
                  "type": "array",
                  "items": {
                    "oneOf": [
                      {
                        "type": "object",
                        "required": ["id", "object", "clientKey"],
                        "properties": {
                          "id": { "$ref": "#/$defs/uuidv7" },
                          "object": { "const": "table" },
                          "clientKey": { "type": "string", "minLength": 1 }
                        },
                        "additionalProperties": false
                      },
                      {
                        "type": "object",
                        "required": ["id", "object", "clientKey"],
                        "properties": {
                          "id": { "$ref": "#/$defs/uuidv7" },
                          "object": { "const": "field" },
                          "clientKey": { "type": "string", "minLength": 1 }
                        },
                        "additionalProperties": false
                      },
                      {
                        "type": "object",
                        "required": ["id", "object", "systemRole"],
                        "properties": {
                          "id": { "$ref": "#/$defs/uuidv7" },
                          "object": { "const": "field" },
                          "systemRole": {
                            "enum": ["row-id", "created-time", "updated-time"]
                          }
                        },
                        "additionalProperties": false
                      }
                    ]
                  }
                },
                "affectedTableIds": {
                  "type": "array",
                  "items": { "$ref": "#/$defs/uuidv7" },
                  "uniqueItems": true
                },
                "affectedFieldIds": {
                  "type": "array",
                  "items": { "$ref": "#/$defs/uuidv7" },
                  "uniqueItems": true
                }
              },
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        },
        {
          "type": "object",
          "required": ["operation", "result"],
          "properties": {
            "operation": { "const": "importCsv" },
            "result": {
              "type": "object",
              "required": [
                "fileId",
                "tableId",
                "revision",
                "changed",
                "createdRows"
              ],
              "properties": {
                "fileId": { "$ref": "#/$defs/uuidv7" },
                "tableId": { "$ref": "#/$defs/uuidv7" },
                "revision": { "$ref": "#/$defs/nonNegativeInt64" },
                "changed": { "const": true },
                "createdRows": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["recordIndex", "rowId"],
                    "properties": {
                      "recordIndex": { "$ref": "#/$defs/safeInteger" },
                      "rowId": { "$ref": "#/$defs/uuidv7" }
                    },
                    "additionalProperties": false
                  }
                }
              },
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        }
      ]
    },
    "commitReceipt": {
      "type": "object",
      "required": [
        "protocol",
        "version",
        "receiptID",
        "epoch",
        "sessionID",
        "workingID",
        "requestID",
        "sequence",
        "operation",
        "fileID",
        "baseRevision",
        "commitRevision",
        "requestDigest",
        "reconciliation"
      ],
      "properties": {
        "protocol": { "const": "eidos-commit-receipt" },
        "version": { "const": "1.0" },
        "receiptID": { "$ref": "#/$defs/opaque" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "workingID": { "$ref": "#/$defs/opaque" },
        "requestID": { "$ref": "#/$defs/requestID" },
        "sequence": { "$ref": "#/$defs/safeInteger" },
        "operation": { "$ref": "#/$defs/slot" },
        "fileID": { "$ref": "#/$defs/uuidv7" },
        "baseRevision": { "$ref": "#/$defs/nonNegativeInt64" },
        "commitRevision": { "$ref": "#/$defs/nonNegativeInt64" },
        "requestDigest": { "$ref": "#/$defs/sha256" },
        "reconciliation": { "$ref": "#/$defs/commitReconciliation" }
      },
      "additionalProperties": false
    },
    "unknownCommitDetails": {
      "type": "object",
      "required": ["commitReceipt"],
      "properties": {
        "commitReceipt": { "$ref": "#/$defs/commitReceipt" }
      },
      "additionalProperties": false
    },
    "runtimeErrorCode": {
      "enum": [
        "invalid-request",
        "unsupported",
        "not-found",
        "already-exists",
        "invalid-value",
        "invalid-query",
        "invalid-formula",
        "cycle",
        "constraint",
        "stale-revision",
        "conflict",
        "forbidden",
        "lossy-confirmation-required",
        "invalid-plan",
        "plan-expired",
        "resource-limit",
        "cancelled",
        "deadline-exceeded",
        "busy",
        "corrupt-file",
        "adapter-error",
        "closed",
        "fatal"
      ]
    },
    "runtimeError": {
      "type": "object",
      "required": ["code", "message", "retryable"],
      "properties": {
        "code": { "$ref": "#/$defs/runtimeErrorCode" },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 4096,
          "pattern": "^[^\\u0000]+$"
        },
        "retryable": { "type": "boolean" },
        "path": {
          "type": "string",
          "maxLength": 4096,
          "pattern": "^(?:/(?:[^~\\u0000]|~[01])*)*$"
        },
        "fileId": { "$ref": "#/$defs/uuidv7" },
        "tableId": { "$ref": "#/$defs/uuidv7" },
        "fieldId": { "$ref": "#/$defs/uuidv7" },
        "rowId": { "$ref": "#/$defs/uuidv7" },
        "currentRevision": { "$ref": "#/$defs/nonNegativeInt64" },
        "details": { "type": "object" }
      },
      "additionalProperties": false
    },
    "wireError": {
      "oneOf": [
        {
          "type": "object",
          "required": ["source", "error"],
          "properties": {
            "source": { "const": "adapter" },
            "error": { "$ref": "#/$defs/adapterError" }
          },
          "additionalProperties": false
        },
        {
          "type": "object",
          "required": ["source", "error"],
          "properties": {
            "source": { "const": "runtime" },
            "error": { "$ref": "#/$defs/runtimeError" }
          },
          "additionalProperties": false
        }
      ]
    },
    "hello": {
      "type": "object",
      "required": ["kind", "protocol", "versions"],
      "properties": {
        "kind": { "const": "hello" },
        "protocol": { "const": "eidos-adapter" },
        "versions": {
          "type": "array",
          "items": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+$" },
          "minItems": 1,
          "uniqueItems": true
        }
      },
      "additionalProperties": false
    },
    "helloError": {
      "type": "object",
      "required": ["kind", "protocol", "error"],
      "properties": {
        "kind": { "const": "hello-error" },
        "protocol": { "const": "eidos-adapter" },
        "error": { "$ref": "#/$defs/adapterError" }
      },
      "additionalProperties": false
    },
    "helloResult": {
      "type": "object",
      "required": [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "limits",
        "cancelMode"
      ],
      "properties": {
        "kind": { "const": "hello-result" },
        "protocol": { "const": "eidos-adapter" },
        "version": { "const": "1.0" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "limits": { "$ref": "#/$defs/limits" },
        "cancelMode": { "enum": ["interrupt", "terminate"] }
      },
      "additionalProperties": false
    },
    "request": {
      "type": "object",
      "required": [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "requestID",
        "sequence",
        "operation",
        "payload"
      ],
      "properties": {
        "kind": { "const": "request" },
        "protocol": { "const": "eidos-adapter" },
        "version": { "const": "1.0" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "requestID": { "$ref": "#/$defs/requestID" },
        "sequence": { "$ref": "#/$defs/safeInteger" },
        "timeoutMs": { "$ref": "#/$defs/safeInteger" },
        "operation": { "$ref": "#/$defs/slot" },
        "payload": true,
        "attachments": { "$ref": "#/$defs/attachments" }
      },
      "additionalProperties": false
    },
    "success": {
      "type": "object",
      "required": [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "requestID",
        "sequence",
        "ok",
        "result"
      ],
      "properties": {
        "kind": { "const": "response" },
        "protocol": { "const": "eidos-adapter" },
        "version": { "const": "1.0" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "requestID": { "$ref": "#/$defs/requestID" },
        "sequence": { "$ref": "#/$defs/safeInteger" },
        "ok": { "const": true },
        "result": true,
        "attachments": { "$ref": "#/$defs/attachments" }
      },
      "additionalProperties": false
    },
    "failure": {
      "type": "object",
      "required": [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "requestID",
        "sequence",
        "ok",
        "error"
      ],
      "properties": {
        "kind": { "const": "response" },
        "protocol": { "const": "eidos-adapter" },
        "version": { "const": "1.0" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "requestID": { "$ref": "#/$defs/requestID" },
        "sequence": { "$ref": "#/$defs/safeInteger" },
        "ok": { "const": false },
        "error": { "$ref": "#/$defs/wireError" }
      },
      "additionalProperties": false
    },
    "commitPrepared": {
      "type": "object",
      "required": [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "requestID",
        "sequence",
        "receipt"
      ],
      "properties": {
        "kind": { "const": "commit-prepared" },
        "protocol": { "const": "eidos-adapter" },
        "version": { "const": "1.0" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "requestID": { "$ref": "#/$defs/requestID" },
        "sequence": { "$ref": "#/$defs/safeInteger" },
        "receipt": { "$ref": "#/$defs/commitReceipt" }
      },
      "additionalProperties": false
    },
    "commitAck": {
      "type": "object",
      "required": [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "requestID",
        "sequence",
        "receiptID",
        "requestDigest"
      ],
      "properties": {
        "kind": { "const": "commit-ack" },
        "protocol": { "const": "eidos-adapter" },
        "version": { "const": "1.0" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "requestID": { "$ref": "#/$defs/requestID" },
        "sequence": { "$ref": "#/$defs/safeInteger" },
        "receiptID": { "$ref": "#/$defs/opaque" },
        "requestDigest": { "$ref": "#/$defs/sha256" }
      },
      "additionalProperties": false
    },
    "cancel": {
      "type": "object",
      "required": [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "requestID"
      ],
      "properties": {
        "kind": { "const": "cancel" },
        "protocol": { "const": "eidos-adapter" },
        "version": { "const": "1.0" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "requestID": { "$ref": "#/$defs/requestID" }
      },
      "additionalProperties": false
    },
    "close": {
      "type": "object",
      "required": [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "requestID"
      ],
      "properties": {
        "kind": { "const": "close" },
        "protocol": { "const": "eidos-adapter" },
        "version": { "const": "1.0" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "requestID": { "$ref": "#/$defs/requestID" },
        "timeoutMs": { "$ref": "#/$defs/safeInteger" }
      },
      "additionalProperties": false
    },
    "closeResult": {
      "type": "object",
      "required": [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "requestID"
      ],
      "properties": {
        "kind": { "const": "close-result" },
        "protocol": { "const": "eidos-adapter" },
        "version": { "const": "1.0" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "requestID": { "$ref": "#/$defs/requestID" }
      },
      "additionalProperties": false
    }
  }
}
```

`hello-error.error` is an unwrapped `AdapterError`. An ordinary failure uses
the tagged `wireError`: `source:"runtime"` carries the Runtime's exact public
`RuntimeError` except `unknown-commit`, while `source:"adapter"` carries an
`AdapterError` generated by the Adapter/Transport boundary. The executable
wire Runtime code set deliberately excludes `unknown-commit`: an unknowable
acknowledged COMMIT is carried as Adapter `commit-outcome-unknown` with its
receipt, so Transport facts are not forged into an error attributed to Runtime.
The client facade unwraps every carried Runtime error unchanged.
It maps Adapter `busy`, `cancelled`, `deadline-exceeded`, and `resource-limit`
or `backpressure` to the same Runtime semantic code (`backpressure` becomes
`resource-limit`); `corrupt`/`not-a-database` become `corrupt-file`;
intentional closure becomes `closed`; and every other reusable Adapter failure
becomes `adapter-error`. A fatal channel/session failure becomes Runtime
`fatal`. Adapter `commit-outcome-unknown`, or loss of the final response after
the client attempted a prepared mutation's ack, becomes Runtime
`unknown-commit` with exactly `retryable:false` and
`details:{reconciliationRequired:true}`. The trusted Host facade retains the
Section 9.5.1 receipt; the RuntimeClient/UI error, Host state, event stream,
and logs MUST NOT expose that receipt or any receipt token. Other mapped Adapter errors may
contain only `details:{adapterCode,fatal}`. Thus
`RuntimeClient` always rejects with its owning Runtime error ABI and never
tunnels an Adapter error as a success payload.

Transported Adapter/Runtime error `message` contains 1..4,096 Unicode scalar
values and no U+0000. Runtime error `path`, when present, is an RFC 6901 JSON
Pointer of at most 4,096 Unicode scalar values and no U+0000; the empty string
is its valid root pointer. JSON Schema `maxLength` counts code points, while
the Transport's Unicode-value validation separately rejects unpaired
surrogates. A binding MUST shorten only diagnostic message text at a scalar
boundary; it MUST NOT truncate a code, path, identifier, revision, receipt, or
machine-readable detail. The complete envelope still fits
`maxResponseBytes`.

### 9.4 Handshake and defaults

Client sends `hello`; server selects exactly `1.0` or returns `hello-error`
with `unsupported-capability`. Successful result creates fresh epoch/session.
Normative defaults are 32 outstanding requests, 16 MiB queued payload, 8 MiB
per request, 16 MiB per response, 30,000 ms request timeout, 300,000 ms
maximum timeout, and 5,000 ms commit-ack timeout. Server MAY advertise other
values within the executable Schema but supports at
least 1 outstanding request, 1 MiB queue, 64 KiB request/response, and 30,000
ms timeout. `maxTimeoutMs` MUST be at least `defaultTimeoutMs`. Client
honors advertised values. Large workflows split, stream internally, or
explicitly use larger advertised timeout.

`cancelMode` is `interrupt` or `terminate`. The former safely interrupts and
reuses after rollback; the latter replaces Worker/process and session.

### 9.5 Request ordering and correlation

First sequence is 1; each later accepted ordinary request increments exactly
1 to `9007199254740991`; reopen epoch before wrap. Each ordinary request ID is
unique within epoch and unordered. Every Transport request ID is a Unicode
scalar string of 1 to 128 UTF-8 octets with no U+0000. Because JSON Schema
`maxLength` counts characters rather than encoded octets, implementations MUST
also enforce the UTF-8-octet bound after decoding. `cancel.requestID` repeats
exactly the target ordinary request ID and creates no new call;
`close.requestID` is a new
unique ID echoed by `close-result`. `commit-prepared` and `commit-ack` repeat
the prepared ordinary request's ID and sequence; the ack creates no new call
or sequence. Any other reused ID, skipped/reordered
sequence, wrong session in the current epoch, or unsupported version is
`protocol-error` and executes nothing. A message from a non-current epoch is
dropped without affecting the current session.

A direct Runtime `RequestContext.requestId` need only be unique among
unresolved calls. The transported `RuntimeClient` facade therefore assigns an
epoch-unique Transport request ID and keeps a private mapping for result and
cancel correlation; it never forwards a reused application ID as the wire ID.
For each ordinary call it validates the Runtime context and sends `timeoutMs`
equal to the minimum of the supplied `deadlineMilliseconds` when present, the
negotiated Runtime `foregroundTimeMsMax`, and Transport `maxTimeoutMs`; when
the Runtime deadline is absent it uses `foregroundTimeMsMax`. Composition
therefore advertises `foregroundTimeMsMax <= maxTimeoutMs`. An already-aborted
signal rejects before send; a later abort uses the cancel rules below.

Every accepted client-facing call MUST settle exactly once. While the channel
remains healthy, server emits exactly one final wire response and repeats
correlation fields exactly. `commit-prepared` is a provisional barrier message,
not a settlement or second response. If crash/termination makes a final wire
response impossible, the client facade settles an acknowledged prepared
mutation as Runtime `unknown-commit` while Host retains its private receipt,
and every other
still-pending call as mapped `transport-fatal`; it ignores any later old-epoch
reply.
Per session, ordinary requests start FIFO. A later request
observes every successful earlier Runtime mutation and cannot be observed by
an earlier request. Mutation/publication transitions are linearizable.
Snapshot-safe reads may run concurrently only when Runtime declares that,
binds them to one logical revision, and responses still emit in sequence.
Cancel/close/fatal controls may overtake queued work but cannot undo committed
mutation. Different sessions have no ordering; Host still forbids two logical
writers for the same source.

### 9.5.1 Prepared-commit barrier and reconciliation

Transported canonical mutations use this trusted Runtime/Transport integration
point; it is not a public Runtime operation and UI never receives it directly:

```text
TransportCommitPreparation = {
  fileID: UUIDv7,
  baseRevision: NonNegativeInt64Decimal,
  commitRevision: NonNegativeInt64Decimal,
  reconciliation: CommitReconciliation
}

TransportCommitBarrier.prepare(preparation, context) -> Promise<void>
```

For an operation that will change canonical state, Runtime performs every SQL
change and invariant check inside its outer write transaction, tentatively
increments revision, constructs its bounded reconciliation record, and invokes
`prepare` immediately before outer COMMIT. No source statement remains active.
`baseRevision` is the revision compared inside that transaction;
`commitRevision` is exactly `baseRevision + 1`. The reconciliation record is
the exact `$defs.commitReconciliation` union mirrored from Eidos Runtime. It MUST include the canonical
postcondition and every server-allocated persistent ID needed to correlate or
refetch the result after an epoch loss. It MUST NOT rely on an undo, cursor,
plan, or other epoch-private token remaining usable. A failure or canonical
no-op never invokes this barrier.

Adapter derives `requestDigest` as lowercase SHA-256 over the UTF-8 RFC 8785
JCS serialization of this exact record:

```text
{
  protocol: "eidos-adapter",
  version: "1.0",
  epoch, sessionID, workingID, requestID, sequence,
  timeoutMs: <request timeoutMs or null>,
  operation, payload,
  attachments: [
    { id, slot, byteLength, sha256: <SHA-256 of the exact attachment bytes> },
    ... in request descriptor order
  ]
}
```

An absent request attachment array normalizes to `[]`. Hashing is completed
and checked against carrier ownership/length before Runtime execution. Adapter
binds the Host-private working ID, allocates an epoch-unique unpredictable
`receiptID`, constructs the executable
Schema's `commitReceipt`, and sends one `commit-prepared` whose outer
correlation fields exactly equal both the request and embedded receipt. The
complete provisional envelope counts against `maxResponseBytes`; if it would
exceed that limit, Adapter rolls back and returns final `resource-limit`
without sending a partial receipt or permitting COMMIT. Before sending it,
Adapter also reserves enough response budget for a final
`commit-outcome-unknown` wrapper containing the same receipt; if either
envelope or the already-computed ordinary success response would not fit,
preparation fails before ack.

Client validates the envelope, correlation, receipt, private session
`workingID`, request digest, embedded commit-reconciliation union, operation/
result matching, and revision transition. It retains the complete
receipt in trusted facade state before sending the exact `commit-ack`. If it
cannot retain the receipt through final settlement or reconciliation, it MUST
NOT acknowledge. Server accepts exactly one matching ack for the currently
prepared request. An exact duplicate of that accepted ack is an idempotent
no-op and cannot affect COMMIT or create a response. An exact late ack for the
most recently timed-out/cancelled preparation is also dropped after its known
rollback and final failure. A wrong receipt ID,
digest, correlation value, or ack unrelated to the current/just-accepted
preparation is fatal `protocol-error`; before commit authorization it causes
rollback, and afterward it fatalizes the epoch without claiming rollback.

The semantic cross-record checks are exact:
`receipt.operation == request.operation == reconciliation.operation`;
`receipt.fileID == reconciliation.result.fileId`;
`receipt.commitRevision == reconciliation.result.revision`; and the int64
value of `commitRevision` is exactly one greater than `baseRevision`. Failure
is pre-ack `protocol-error` and no COMMIT is authorized.

Runtime MUST NOT issue COMMIT until the matching ack has been accepted and
`prepare` resolves. The wait holds the serialized write transaction and is
bounded by the smaller of the request's remaining effective deadline and
`commitAckTimeoutMs`. Expiry or cancel before ack rolls back and, if the
channel survives, returns `deadline-exceeded` or `cancelled`; no commit is
possible. After ack, Runtime attempts COMMIT exactly once. A known COMMIT
failure rolls back and returns the owning structured failure; success returns
the ordinary success result. If Adapter cannot prove either commit or rollback,
it returns wire Adapter `commit-outcome-unknown` with exactly that receipt,
marks Connection/session fatal, and executes nothing else. Client discards the
receipt only after receiving a final result that proves commit or rollback.

Only one prepared mutation may exist per session. A client MUST NOT send an
ordinary request with a sequence after a mutation until it has received that
mutation's final response. Server does not start any already queued later
request while a barrier is prepared. These rules, plus the Host's sole logical
writer invariant, make revision reconciliation decisive for a pending
mutation.

If the client attempted the ack but loses the final response, it invalidates
the epoch, privately retains the receipt, and rejects that call with Runtime
`unknown-commit`. It MUST NOT automatically replay. Trusted composition reopens and
validates the same working database through a new Connection/Runtime epoch,
proves continuity of the receipt's working ID, then reads File ID/revision from
one snapshot:

1. same working ID/File ID and `revision == commitRevision`: under the
   Section 7.5 exclusive working-writer invariant, the mutation committed;
   `reconciliation` supplies its persistent IDs and callers refetch any live
   projection;
2. same working ID/File ID and `revision == baseRevision`: it did not commit
   and a new request may be issued after reopen;
3. a different/unprovable working ID, any other File ID/revision, or a file
   that cannot be validated: outcome is
   not attributable to this receipt; report conflict/fatal and require explicit
   recovery rather than replay.

From the instant an unknown outcome is detected, the old session is fatal:
every later public call except idempotent `close` fails locally as Runtime
`fatal` and sends no old-epoch message. Reconciliation always uses a new epoch.

The receipt proves preparation and permits reconciliation; it is not itself
proof of COMMIT. Epoch-private result members are never resurrected. A receipt
whose request digest or embedded reconciliation validation fails is
`protocol-error`, not a retry token.

### 9.6 Structured clone and ownership

Browser uses HTML
[structured serialization/transfer](https://html.spec.whatwg.org/multipage/structured-data.html#safe-passing-of-structured-data);
Desktop is equivalent. Envelope/payload values are JSON values: null, boolean,
Unicode string, finite binary64 number, arrays, and string-key records. Graphs
are acyclic. Functions, DOM/native objects, prototype-dependent Error, handles,
statements, and platform grants are forbidden in Runtime payloads. A Host
internal channel that moves a platform grant is outside this Transport Profile,
is never exposed through RuntimeClient/HostServices, and MUST NOT reuse this protocol
name or claim its messages validate as Adapter wire envelopes.

Transferred ArrayBuffer becomes receiver-owned and sender treats it detached;
without transfer support sender copies. SharedArrayBuffer is optional and never
required. Returned bytes never alias SQLite/WASM memory or reusable buffers.

### 9.7 Backpressure

For portable accounting, one carrier's byte size is the UTF-8 length of the
RFC 8785 JCS serialization of its envelope plus the sum of attachment
`byteLength` values. Client counts accepted-without-final-response requests
and their request-carrier sizes against `maxQueuedBytes`; each request also
fits `maxRequestBytes`. Each response fits `maxResponseBytes`. Server rejects
queue/request excess before execute as `backpressure`, never drops/queues
indefinitely. Oversized result fails `resource-limit` before partial response.
Runtime paging controls normal size;
publication streaming stays inside Host composition, never RuntimeClient.

This carrier accounting is distinct from Runtime semantic accounting. For a
CSV operation, Runtime omits the logical `csv` member and its key from
`requestBytesMax` or `responseBytesMax` JCS accounting and counts the exact
octets once under `csvBytesMax`. Adapter counts the actual envelope (including
attachment descriptors) and those octets once under its carrier limits.
Envelope/descriptor bytes are Adapter accounting and MUST NOT be charged to
Runtime's payload-only JCS limits.

### 9.8 Cancel, deadline, terminate

Cancel identifies epoch/session/request. Cancelling an already settled or
never-accepted request in the current session is an idempotent no-op with no
second response. A queued target is removed and returns `cancelled`. For a
running target in interrupt mode, Adapter requests Connection interruption and
waits for Runtime settlement. It returns `cancelled` (or
`deadline-exceeded`) only when rollback or absence of commit is known. If
commit linearized first, the ordinary successful result wins. Before a
prepared mutation's valid ack, cancellation/expiry forces rollback and no
commit is possible. After the client attempts that ack, loss of the final
outcome is Runtime `unknown-commit` while Host retains the receipt, never
`cancelled`, `deadline-exceeded`, or bare `transport-fatal`. Timeout
starts at server acceptance, includes queue/busy, uses monotonic clock, and
defaults when omitted. A smaller request or shutdown deadline controls.

The client facade makes receipt retention/ack-attempt one atomic state
transition with respect to cancel/deadline. If cancellation wins, it sends
cancel and never ack; if ack-attempt wins, it sends no later cancel for that
request and waits for success, known failure, or reconciliation. It MUST NOT
race both controls onto the channel.

In terminate mode, cancelling active SQL terminates the dedicated Worker/
process. Before commit ack, transaction recovery guarantees no COMMIT began,
so the target receives cancellation/deadline if the client still has a viable
settlement channel; otherwise it receives mapped `transport-fatal` with no
mutation retry until reopen. After ack was attempted, the target receives
`unknown-commit` while Host retains its receipt whether termination, deadline,
or IPC loss
removed the final response. All other accepted requests fail mapped
`transport-fatal`. Epoch/session are invalid. Host preserves recovery where
safe and reopens and reconciles through a new Connection/epoch before any
retry.

### 9.9 Lifecycle

```text
new -> handshaking -> ready -> closing -> closed
                         |
                         `-> fatal
```

Transported `RuntimeClient.close(context)` allocates the close envelope's
epoch-unique request ID and maps a present effective context duration to
`timeoutMs`, capped by `maxTimeoutMs`. If its signal is already cancelled
before send, the facade rejects with `cancelled` and leaves the session open.
Once server accepts close, cancellation cannot revoke cleanup and no `cancel`
envelope targets the close ID. The timeout bounds graceful settlement, not
resource release: on expiry the client invalidates the epoch and settles once
with mapped `transport-fatal`, while server still closes or terminates the
isolated owner. This is why close has a context on RuntimeClient but no
cancellable close transaction on the wire.

Accepted close stops new work, cancels queue, preserves already committed
mutation, settles/terminates active work, closes Runtime/Connection, and
releases snapshots, assets, and lease. It sends `close-result` if the channel
survives; otherwise the client facade settles close once with mapped
`transport-fatal`. Repeated close is safe at API level. Malformed
envelope, impossible sequence, correlation loss, crash, IPC loss, or unknown
write outcome is fatal. Old-epoch messages never affect a new session.

## 10. Error ABI

```text
AdapterError = {
  code: AdapterErrorCode,
  message: UnicodeString,
  retryable: Boolean,
  fatal: Boolean,
  sqlitePrimaryCode?: Integer,
  sqliteExtendedCode?: Integer,
  details?: JSONValue
}
```

Message is diagnostic, contains 1..4,096 Unicode scalar values and no U+0000
in every binding, and is never parsed. Details contain no SQL parameters,
canonical cells, paths, credentials, or handles by default. SQLite codes are
actual official [primary/extended codes](https://www.sqlite.org/rescode.html).

| Code                     | Meaning                                                         |     Retryable default |   Fatal default |
| ------------------------ | --------------------------------------------------------------- | --------------------: | --------------: |
| `adapter-closed`         | call after close                                                |                    no |             yes |
| `invalid-argument`       | invalid port call/binding                                       |                    no |              no |
| `invalid-sql-value`      | tagged ABI violation                                            |                    no |              no |
| `unsupported-capability` | required capability/probe absent                                |                    no | yes during open |
| `sql-error`              | other SQLite prepare/step error                                 |                    no |              no |
| `sql-function-error`     | registered scalar failed                                        |                    no |              no |
| `constraint`             | SQLite constraint result                                        |                    no |              no |
| `busy`                   | busy timeout/snapshot contention                                |                   yes |              no |
| `locked`                 | SQLite locked result                                            |                   yes |              no |
| `cancelled`              | explicit cancellation before commit                             |         caller choice |              no |
| `deadline-exceeded`      | deadline expired                                                |         caller choice |              no |
| `resource-limit`         | advertised limit exceeded                                       | maybe smaller request |              no |
| `out-of-memory`          | allocation failed                                               |                    no |           maybe |
| `io-error`               | storage/VFS I/O failed                                          |                 maybe |           maybe |
| `corrupt`                | corruption reported                                             |                    no |             yes |
| `not-a-database`         | not SQLite database                                             |                    no | yes during open |
| `read-only`              | write on read-only target                                       |                    no |              no |
| `permission-denied`      | Host permission absent                                          |     after user action |              no |
| `source-changed`         | identity/content mismatch                                       |      after resolution |              no |
| `writer-unavailable`     | lease unavailable                                               |                   yes |              no |
| `publication-failed`     | candidate/publication verify failed                             |        cause-specific |           maybe |
| `recovery-required`      | destination unsafe; recovery retained                           |        after recovery |  yes for writes |
| `asset-unavailable`      | asset unavailable                                               |        cause-specific |              no |
| `backpressure`           | queue limit exceeded                                            |                   yes |              no |
| `commit-outcome-unknown` | acknowledged mutation COMMIT cannot be proved; receipt retained |                    no |             yes |
| `protocol-error`         | invalid Transport state                                         |                    no |             yes |
| `transport-closed`       | Transport closed                                                |                    no |             yes |
| `transport-fatal`        | Worker/process/IPC not reusable                                 |          after reopen |             yes |

Browser/Desktop preserve code, flags, SQLite codes, and safe details. They do
not collapse failures to exception strings. Runtime owns mapping to its public
errors.

For a table entry marked cause-specific or maybe, Adapter sets `fatal=true`
exactly when Connection/session integrity, rollback, or publication outcome is
unknown; otherwise false. It sets `retryable=true` only when no effect
linearized and retrying the unchanged request after the reported external
condition may succeed. Cancellation and deadline default to `retryable=false`;
caller policy may issue a new request with a new request ID.

## 11. Browser Profile

### 11.1 Baseline

`EA-Browser-1.0` MUST run SQLite/WASM and Runtime in a
[Dedicated Worker](https://html.spec.whatwg.org/multipage/workers.html), not on
the Window event loop. Window side contains only Transport client and trusted
user-activation/permission composition. SQL prepare/step, transactions,
validation, backup/export, and large hashing execute in Worker.

Baseline `memory-import-export` MUST accept owned bytes from selected `File` or
application storage; open private read-write working database; expose Runtime
only through Transport; build valid self-contained candidate; support Save
Copy by download or authorized destination; and keep recovery outside WASM
heap. Imported source may be read-only while editing remains Save-Copy capable.

### 11.2 WASM and OPFS

WASM passes every Connection probe, preserves int64 without unsafe JavaScript
Number, returns BLOB independent of linear memory, and provides interrupt or
terminate. Report embedded SQLite version, not package version. Heap loss/trap
is process crash/fatal; dirty work follows recovery interval.

Adapter MAY declare `browser-opfs-working`. OPFS is Host-private working/
recovery storage, not published source. Handles, VFS files, locks, and origin
metadata never become File state. The platform model is the
[File System Standard](https://fs.spec.whatwg.org/). OPFS database stays in
dedicated Worker, uses tested locking/durability VFS, and has one writer lease.
Quota failure is limit/I/O error, never success. Export remains independent
candidate. State is keyed by source/session identity plus File ID, never only
filename; orphan cleanup follows disclosed retention.

### 11.3 File System Access

Adapter MAY declare `browser-file-system-access`, governed by WICG
[File System Access](https://wicg.github.io/file-system-access/). Window
composition obtains secure-context user activation and makes the handle an
opaque Host grant. RuntimeClient/UI never sees the handle; Worker never
spontaneously opens picker/prompt.

Before overwrite, Adapter obtains fresh File bytes/token and applies CAS. A
`FileSystemWritableFileStream` close is not presumed strong atomic CAS. Without
a stronger documented user-agent primitive, maximum claims are:

```text
casGuarantee = "cooperative"
atomicReplace = false
durability = "best-effort"
```

Thus recovery-before-write and post-close digest verification are mandatory.
Imported `File` without writable handle has `writeCurrent=false`, potentially
`saveCopy=true`.

Browser Adapter MUST use secure context where required; treat cross-origin
isolation/SharedArrayBuffer as optional; scope OPFS/IndexedDB recovery; never
put canonical values/bytes/paths in URL, analytics, or telemetry by default;
validate message port/epoch; revoke object URLs/streams; and expose permission
or quota failure without destructive fallback.

## 12. Desktop Profile

`EA-Desktop-1.0` uses native SQLite 3.45.0+ and executes every blocking DB
operation in dedicated Worker thread/helper process. It MUST NOT prepare, step,
checkpoint, hash large file, or wait locks on renderer/main UI thread. Driver
choice, including `better-sqlite3`, is non-normative; observed behavior is
wrapped/probed behind ConnectionPort.

Source authority comes from trusted picker, scoped CLI, or application grant.
Views get only opaque tokens. Host normalizes/validates its paths, prevents
granted-root traversal, and rejects attacker SQLite URI parameters. Worker/
process owns Connection, statements, writer lease, temp files; pointers and
driver objects never cross IPC. Non-interruptible blocking driver requires
terminate isolation that cannot kill UI or unrelated session.

Where filesystem supports it, Desktop SHOULD claim:

```text
writerLease = "exclusive"
casGuarantee = "strong"
atomicReplace = true
durability = "durable"
```

This requires identity-aware lock, token check under lock, same-filesystem
temporary candidate, durable file flush, atomic replace, and containing
directory flush where supported. Advisory lock alone is not strong against
non-cooperating replacement. If unavailable on OS/filesystem/network mount/
sandbox, downgrade capabilities and use non-atomic recovery; successful
write/rename alone is not proof of durability.

Recovery/staged candidates use restrictive private storage or scoped sibling
temp. Startup inspects incomplete markers before cleanup. It deletes candidate
only after proving source equals verified old/new bytes and no newer recovery
exists. Watchers are advisory; save revalidates. Inode/file-ID, symlink-target,
permission, or deletion changes follow external-change rules.

## 13. Composition Facade Mapping

`EA-Host-1.0` exposes this normative high-level, UI-facing composition binding.
It is implemented from PublicationPort, ConnectionPort, Runtime, Transport,
and trusted platform grant UI; it is not a second low-level port. Eidos UI
imports this binding and MUST NOT redefine it.

```ts
interface HostServices {
  negotiate(
    request: { protocol: "eidos-host"; versions: ["1.0"] },
    context: RequestContext
  ): Promise<{
    version: "1.0"
    serviceCapabilities: HostServiceCapabilities
    limits: HostLimits
  }>

  openSource(
    request: { sourceToken: string; access: "read" | "readwrite" },
    context: RequestContext
  ): Promise<{
    sessionId: string
    runtime: RuntimeClient
    state: HostSessionState
  }>
  createSource(
    request: { destinationToken: string; title: string },
    context: RequestContext
  ): Promise<{
    sessionId: string
    runtime: RuntimeClient
    state: HostSessionState
  }>
  requestWritePermission(
    request: { sessionId: string },
    context: RequestContext
  ): Promise<HostSessionState>
  save(
    request: { sessionId: string },
    context: RequestContext
  ): Promise<HostSaveResult>
  saveCopy(
    request: {
      sessionId: string
      destinationToken: string
      adopt: "keep-current" | "adopt-copy"
    },
    context: RequestContext
  ): Promise<HostSaveCopyResult>
  reconcileCommit(
    request: { sessionId: string },
    context: RequestContext
  ): Promise<HostCommitReconciliationResult>
  resolveConflict(
    request: {
      sessionId: string
      strategy: "reload" | "save-copy" | "merge"
      conflictToken: string
      destinationToken?: string
      adopt?: "keep-current" | "adopt-copy"
    },
    context: RequestContext
  ): Promise<HostConflictResult>
  listRecovery(
    request: { sessionId: string },
    context: RequestContext
  ): Promise<HostRecoveryReport>
  restoreRecovery(
    request: { sessionId: string; recoveryToken: string },
    context: RequestContext
  ): Promise<HostRecoveryResult>
  discardRecovery(
    request: { sessionId: string; recoveryToken: string },
    context: RequestContext
  ): Promise<HostRecoveryResult>
  acquireAsset(
    request: { sessionId: string; sourceToken: string },
    context: RequestContext
  ): Promise<{ entry: FileEntry }>
  resolveAsset(
    request: {
      sessionId: string
      entryId: string
      purpose: "thumbnail" | "preview" | "download"
    },
    context: RequestContext
  ): Promise<AssetLease>
  releaseAsset(
    request: { sessionId: string; leaseId: string },
    context: RequestContext
  ): Promise<void>
  close(request: { sessionId: string }, context: RequestContext): Promise<void>
  subscribe(
    sessionId: string,
    listener: (state: HostSessionState) => void
  ): () => void
}

interface HostServiceCapabilities {
  canOpenSource: true
  canCreateSource: boolean
  canRequestPermission: boolean
  canSaveCopy: boolean
  canReconcileCommit: boolean
  canResolveConflict: boolean
  canRecover: boolean
  canUseAssets: boolean
}

interface HostCapabilities {
  canWriteCurrent: boolean
  canSaveCopy: boolean
  canRequestPermission: boolean
  hasRecovery: boolean
  assetReadSchemes: string[]
  assetWriteSchemes: string[]
  casGuarantee: "strong" | "cooperative" | "none"
  atomicReplace: boolean
  durability: "durable" | "best-effort"
}

interface HostLimits {
  sourceBytesMax: string
  candidateBytesMax: string
  recoveryBytesMax: string
  recoveryEntriesMax: number
  recoveryRetentionSecondsMax: number
  assetBytesMax: string
  assetPreviewBytesMax: string
  concurrentAssetLeasesMax: number
  concurrentSessionsMax: number
}

type HostPhase =
  | "opening"
  | "ready-readonly"
  | "ready-clean"
  | "ready-dirty"
  | "publishing"
  | "commit-unknown"
  | "conflict"
  | "recovery-required"
  | "fatal"
  | "closed"

interface HostError {
  code:
    | "invalid-request"
    | "unsupported"
    | "invalid-source"
    | "conflict"
    | "permission-denied"
    | "source-changed"
    | "writer-unavailable"
    | "publication-failed"
    | "recovery-required"
    | "asset-unavailable"
    | "cancelled"
    | "deadline-exceeded"
    | "resource-limit"
    | "io-error"
    | "unknown-commit"
    | "closed"
    | "fatal"
  message: string
  retryable: boolean
  details?: JsonObject
}

interface HostSessionState {
  sessionId: string
  phase: HostPhase
  capabilities: HostCapabilities
  limits: HostLimits
  fileId?: string
  revision?: string
  conflictToken?: string
  error?: HostError
}

interface HostSaveResult {
  state: HostSessionState
}
interface HostSaveCopyResult {
  state: HostSessionState
  adopted: boolean
  runtime?: RuntimeClient
}
interface HostCommitReconciliationResult {
  state: HostSessionState
  outcome: "committed" | "rolled-back" | "conflict"
  runtime?: RuntimeClient
  reconciliation?: CommitReconciliation
}
interface HostConflictResult {
  state: HostSessionState
  runtime?: RuntimeClient
}
interface HostRecoveryResult {
  state: HostSessionState
  runtime?: RuntimeClient
}
interface HostRecoveryReport {
  items: Array<{
    recoveryToken: string
    fileId: string
    revision: string
    createdAt: string
    size: string
  }>
}
interface AssetLease {
  leaseId: string
  entryId: string
  purpose: "thumbnail" | "preview" | "download"
  mediaType: string
  name: string
  size: string
  expiresAt: string
  resourceToken: string
}
```

`RequestContext`, `RuntimeClient`, `CommitReconciliation`, `FileEntry`, and `JsonObject` are imported
from Eidos Runtime. `HostError.message` has Section 9.3's 1..4,096-scalar,
no-U+0000 bound. Every async method honors cancellation/deadline. The facade maps
Adapter errors into the finite Host code set without losing cancellation,
deadline, resource, I/O, conflict, recovery, or fatal distinctions. A method
returns exactly one result/error. Cancellation after publication replacement
has started follows Section 7.1's verified-outcome rule.

For `HostServices.close`, an already-cancelled context prevents acceptance and
leaves the session open. After acceptance, Section 9.9 cleanup is
non-cancellable: Host closes Transport/Runtime/Connection and the Publication
session even if the caller's wait deadline expires. Failure to receive a clean
ack yields `fatal`, never a claim that cleanup was skipped.

`createSource` resolves a create-only destination expectation, opens an empty
private writable database, invokes `Runtime.create`, produces and validates a
self-contained candidate, publishes it create-only, and returns `ready-clean`.
Runtime allocates File/object IDs; Host never does. Failure before verified
publication leaves no claimed source and retains recovery when destination
outcome is uncertain.

Pre-open negotiation reports service-level operation availability only. All
source/filesystem-dependent permission, CAS, atomicity, durability, scheme,
and write values appear only in the `HostSessionState.capabilities` returned by
`openSource`, `createSource`, or later state. Negotiated `HostLimits` are service maxima. Every
session state carries its effective limits; state events replace them
atomically when permission, storage, or quota changes. UI sizes work from the
current state, and Host reports `resource-limit` before work.

The `RuntimeClient` returned by `openSource` reports effective Runtime limits:
composition takes the minimum of Runtime semantic limits and Transport
`maxRequestBytes`, `maxResponseBytes`, and `maxTimeoutMs`, reducing page,
projection, cell, and foreground-time limits where necessary. It uses the JCS
plus attachment accounting in Section 9.7 and never advertises an operation
that the active Transport necessarily rejects.

`saveCopy(adopt:"keep-current")` returns `adopted=false`, no Runtime, and the
unchanged current-source dirty/clean state. `adopt-copy` returns
`adopted=true`, a new Runtime epoch, and `ready-clean` state for the copy after
closing the old epoch. `resolveConflict` requires `destinationToken` and
`adopt` exactly for `save-copy` and forbids them otherwise. A returned
`runtime` is present exactly when a new epoch was created.

`canReconcileCommit` is true for Browser/Desktop and every Host service that
returns a read-write Runtime. A direct binding retains Runtime's exact direct
reconciliation record instead of an Adapter receipt but uses the same
working-ID/revision algorithm. When false, the method returns `unsupported`
and that read-only service cannot produce `commit-unknown`. On a transported
acknowledged mutation with an unavailable final result—or the equivalent
direct Runtime unknown outcome—composition atomically retains the receipt or
direct reconciliation record under
the Host session, changes phase to `commit-unknown`, and permanently invalidates
the old RuntimeClient. It emits only the stable Host error code
`unknown-commit` with `retryable=false`; receipt bytes/IDs are never in Host
state or events. That state retains `fileId` when known but omits `revision`
because neither base nor commit revision may be claimed yet.

`reconcileCommit` is accepted exactly in `commit-unknown`. Host uses its private
receipt/direct record to reopen the same exclusive working store and prove the same
`workingID`, securely creates a new Connection/Runtime epoch, validates the
File, then applies Section 9.5.1's File ID/revision algorithm. The Host
`sessionId` remains stable; the Runtime epoch changes. Result presence is
exact:

- `committed`: `runtime` and `reconciliation` are present; the latter is the
  validated Runtime `CommitReconciliation` and includes all persistent ID
  mappings;
- `rolled-back`: `runtime` is present and `reconciliation` is absent;
- `conflict`: both are absent, state phase is `conflict`, and Host preserves
  the working store/recovery, returns an opaque `conflictToken` in state, and
  requires existing conflict/recovery flows for explicit resolution.

For committed/rolled-back, state is `ready-clean` only when the reconciled
working revision equals the published baseline and otherwise `ready-dirty`.
UI atomically replaces its old RuntimeClient with the returned one and
refetches snapshot/schema/visible rows. Rolled-back allows a new explicit
mutation after refresh; no layer automatically retries it. Missing receipt,
wrong phase, working-ID discontinuity presented as success, or receipt/schema
mismatch is `invalid-request`/`fatal`, never guessed reconciliation.
Cancellation/deadline before a decision closes any provisional new epoch,
retains the private receipt and `commit-unknown` phase, and is safely
retryable; once a decided result is constructed, that result wins.

Asset entry IDs are allocated by Runtime using its injected UUIDv7 inputs;
Host stages/resolves bytes but does not invent canonical IDs. Returned entries
are logical candidate values and become canonical only through Runtime row
mutation.

The required actions delegate as follows:

| Composition action       | Adapter/Runtime delegation                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `negotiate`              | source-independent EA-Host service capabilities and maxima; no source/Transport session exists yet                                                                           |
| `openSource`             | resolve opaque grant; PublicationPort open/read; import through SourceSnapshot and `release` in `finally`; create Connection/Runtime/Transport session                       |
| `createSource`           | resolve create-only grant; Runtime creates/validates File; PublicationPort publishes; return new session                                                                     |
| `requestWritePermission` | trusted user-activation layer refreshes opaque grant; PublicationPort observes result                                                                                        |
| `save`                   | Runtime `createPublicationSnapshot({maxBytes:candidateBytesMax},context)`, validate/hash that frozen source, PublicationPort `publish`, then snapshot `release` in `finally` |
| `saveCopy`               | same frozen-candidate/`finally release` boundary, PublicationPort `saveCopy`; explicit keep/adopt choice controls whether a new Runtime epoch is opened                      |
| `reconcileCommit`        | Host-private receipt/direct record + same-working-ID reopen; File ID/revision decides committed/rolled-back/conflict; returns replacement Runtime only for a decided outcome |
| `resolveConflict`        | reload/discard and Save Copy are Host flows; `merge` delegates entirely to Runtime/product                                                                                   |
| `listRecovery`           | PublicationPort `listRecovery`                                                                                                                                               |
| `restoreRecovery`        | PublicationPort read, File validate, then new Connection/Runtime epoch                                                                                                       |
| `discardRecovery`        | PublicationPort `discardRecovery` after explicit intent                                                                                                                      |
| `acquireAsset`           | composition resolves UI `sourceToken`; PublicationPort acquires an `import` lease; Runtime allocates the File-entry ID and product returns the candidate value               |
| `resolveAsset`           | composition resolves Runtime File-entry ID to canonical URI; PublicationPort acquires a `read` lease and resolves bytes/descriptor                                           |
| `releaseAsset`           | PublicationPort `releaseAsset`                                                                                                                                               |
| `close`                  | close Transport (the sole closer of Runtime then Connection), then close Publication session; never close either component twice                                             |
| `subscribe`              | composition emits derived Host state/capability events; no native object or bytes                                                                                            |

The facade returns opaque session, conflict, recovery, source, and asset tokens
plus Runtime client. It never returns path, handle, SQLite connection, SQL,
PublicationPort, or raw write primitive. UI-specific action availability and
presentation remain owned by Eidos UI.

## 14. Limits and Resource Management

There are no hidden mandatory limit names. `ConnectionCapabilities` advertises
SQL/value/variable/result/busy limits and required snapshot support; each
snapshot receives the int64 `maxBytes` derived from `candidateBytesMax`.
Transport hello advertises outstanding,
queue, request, response, ordinary-time, and commit-ack limits; `PublicationLimits` advertises
source/candidate/recovery/asset quotas and retention; `HostLimits` derives
those plus `concurrentSessionsMax`. Claims never exceed effective
SQLite/VFS/platform limits. Limit failure occurs before partial publication
and is `resource-limit`.

There is at most one unresolved commit receipt per session because mutation
sequencing forbids a later request. Its JCS bytes already fit
`maxResponseBytes`; Host releases it after decided reconciliation or session
close. This is not an unadvertised unbounded ledger.

Runtime owns page size and semantic complexity; Adapter owns memory, SQL,
message, byte, file, and time enforcement. Adapter never silently changes a
Runtime query to fit; it rejects so Runtime can chunk/report. Close releases
statements, buffers, object URLs, ports, handles, locks, safe temp files, and
asset leases; recovery follows separate retention.

## 15. Conformance Tests

### 15.1 Connection transcripts

`EA-Connection` MUST cover:

1. all open probes;
2. NULL, int64 min/max/zero, `-0.0`, smallest/largest finite REAL, empty and
   Unicode TEXT, empty BLOB, BLOB with zero/`ff`;
3. rejection of bad/out-of-range int64, NaN/infinity, invalid UTF-8, aliased
   result BLOB;
4. duplicate/empty/non-ASCII columns and ordered rows;
5. positional arity and exact storage via `typeof(?N)`;
6. run counts/lossless last rowid;
7. runMany reuse/first-failure/enclosing rollback;
8. outer read-DEFERRED snapshot without write reservation, read-only
   enforcement, outer write-IMMEDIATE, nested success/rollback, rejected
   read-to-write escalation, and outer rollback;
9. scalar arity/tags/throw/registration per Connection;
10. a streaming ConnectionSnapshot created after an established outer-read
    snapshot; concurrent-writer exclusion from its image; WAL-to-independent
    main-database behavior; offset/EOF reads; int64 maxBytes rejection before
    unbounded backing growth; release and close cleanup;
11. data-version equality, own commit, second-connection commit, reopen;
12. busy without transaction replay;
13. queued cancel, interrupt or declared lack, deadline;
14. idle/queued/transaction/idempotent close;
15. secure bootstrap and forbidden public surfaces;
16. deterministic wall/monotonic/entropy injection and in-process cancellation
    matching Transport cancellation.

### 15.2 Host fault transcripts

`EA-Host` injects faults at source change before/after lease/before replace;
lease/permission denial; save during mutation; `busy` mutation rejection after
frozen snapshot while publication is active; busy checkpoint/backup; File
validation; short write, disk/quota, flush, close, replace, digest mismatch;
crash before/after recovery/during write/after replace/before recovery delete;
new/existing Save Copy; rename/replacement/symlink/deletion/restore; clean
reload vs dirty conflict; recovery order/expiry/discard/restore; asset traversal,
unauthorized network, limits, staging, release.

Source transcripts additionally assert at most one live SourceSnapshot,
immutable token-consistent reads, `finally` release on import/validation
failure, post-release rejection, repeated release, and session-close cleanup.

Every fault asserts source bytes, candidate/recovery, session state,
descriptor/token, logical revision, and absence of required sidecars—not only
the exception.

### 15.3 Transport transcripts

Browser/Desktop pass identical version/capability negotiation; envelope Schema
validation; session/epoch mismatch; request ID vs contiguous sequence; FIFO and
mutation/query linearization; duplicate/skip/replay/reorder rejection;
attachment mapping and detached ownership; no WASM/native alias; error
fidelity; exact/over-limit backpressure; queued cancel, interrupt, terminate,
deadline/busy race; prepared-receipt size/schema/digest and server-assigned-ID
coverage across all five commit-reconciliation operation tags; loss before
prepared, before ack, after ack, during COMMIT, and after
COMMIT before final response; base/commit/other-revision reconciliation;
receipt-gated retry; fatal subsequent calls; crash, stale epoch, reopen, and
context-bearing close. Host composition additionally covers private receipt
non-exposure, `commit-unknown` action gating, same-working-ID proof, all three
`reconcileCommit` outcomes, replacement-Runtime handoff, server-assigned ID
recovery, and explicit post-rollback retry.

### 15.4 Cross-platform golden vectors

Same conforming Runtime over Browser/Desktop produces identical ordered tagged
Connection values; Runtime typed results/public errors; logical revision
postconditions; candidates with identical canonical state; equivalent Adapter
error/state under faults; and recoveries reopening same File ID/revision/state.
Byte-identical SQLite layout is not required unless vector says so—pages,
free-list, and planner stats may differ, canonical meaning may not.

Conformance report records Adapter/profile/capabilities, SQLite version/source
ID, platform/VFS, corpus version, skipped optional subprofiles. Required tests
cannot be skipped.

## 16. Security and Privacy Checklist

Conforming implementations treat Files and Transport payloads as untrusted and
MUST:

1. keep arbitrary SQL/native capability outside UI/extensions;
2. bind values and accept identifiers only from Runtime quoting;
3. disable extension loading/trusted schema;
4. enforce engine/memory/byte/statement/time/queue limits;
5. interrupt or isolate denial-of-service SQL;
6. verify source identity/content before overwrite;
7. preserve recovery before non-atomic destructive write;
8. avoid default logging of content, bindings, paths, grants, credentials;
9. least-scope and promptly release grants/asset leases;
10. verify published bytes before clean;
11. replace fatal connections, never continue uncertain state;
12. keep Host-private state outside canonical `.eidos`.
13. keep working IDs and commit receipts inside trusted Host/Transport
    composition, never UI, extensions, telemetry, or canonical state.

## 17. Rationale (Informative)

Tagged SQL values prevent int64 truncation, preserve `1.0` REAL as distinct
from INTEGER, and test BLOB ownership. Ordered row arrays preserve duplicate
columns. IMMEDIATE makes contention visible before partial logical mutation;
savepoints give nested rollback without fake independent commits.

Logical revision, data-version, and content token answer different questions:
did canonical meaning change, must this Connection invalidate caches, and may
these bytes replace that source version. Combining them causes lost updates or
false conflicts.

Browser/Desktop storage guarantees genuinely differ. Conformance requires
same semantic outcome plus honest capabilities, not pretending a browser stream
is an atomic filesystem rename.

## 18. Normative References

- [Eidos File Format 1.0](./eidos-file-1.0.md)
- [Eidos Runtime 1.0](./eidos-runtime-1.0.md)
- [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)
- [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)
- [RFC 9562: Universally Unique IDentifiers](https://www.rfc-editor.org/rfc/rfc9562)
- [RFC 3986: Uniform Resource Identifier](https://www.rfc-editor.org/rfc/rfc3986)
- [RFC 6901: JavaScript Object Notation Pointer](https://www.rfc-editor.org/rfc/rfc6901)
- [RFC 8785: JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785)
- [JSON Schema 2020-12 Core](https://json-schema.org/draft/2020-12/json-schema-core)
- [JSON Schema 2020-12 Validation](https://json-schema.org/draft/2020-12/json-schema-validation)
- [NIST FIPS 180-4: Secure Hash Standard](https://doi.org/10.6028/NIST.FIPS.180-4)
- [SQLite 3.45.0 release history](https://www.sqlite.org/changes.html#version_3_45_0)
- [SQLite transactions](https://www.sqlite.org/lang_transaction.html)
- [SQLite savepoints](https://www.sqlite.org/lang_savepoint.html)
- [SQLite value binding](https://www.sqlite.org/c3ref/bind_blob.html)
- [SQLite result values](https://www.sqlite.org/c3ref/column_blob.html)
- [SQLite result column names](https://www.sqlite.org/c3ref/column_name.html)
- [SQLite statement read-only detection](https://www.sqlite.org/c3ref/stmt_readonly.html)
- [SQLite application-defined functions](https://www.sqlite.org/c3ref/create_function.html)
- [SQLite data_version](https://www.sqlite.org/pragma.html#pragma_data_version)
- [SQLite interrupt](https://www.sqlite.org/c3ref/interrupt.html)
- [SQLite defensive mode](https://www.sqlite.org/c3ref/c_dbconfig_defensive.html)
- [SQLite result codes](https://www.sqlite.org/rescode.html)
- [SQLite WAL](https://www.sqlite.org/wal.html)
- [SQLite Online Backup API](https://www.sqlite.org/backup.html)
- [SQLite serialization](https://www.sqlite.org/c3ref/serialize.html)
- [WHATWG Web Workers](https://html.spec.whatwg.org/multipage/workers.html)
- [WHATWG structured serialization/transfer](https://html.spec.whatwg.org/multipage/structured-data.html#safe-passing-of-structured-data)
- [WHATWG File System Standard](https://fs.spec.whatwg.org/)
- [WICG File System Access](https://wicg.github.io/file-system-access/)
- [W3C Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/)
