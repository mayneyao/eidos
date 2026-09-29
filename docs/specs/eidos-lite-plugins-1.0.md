# Eidos Plugins — API 3.0

Status: Normative source-tree contract; release availability is determined by the installed host

Plugin API: 3.0.0

Canonical language: English

Owner: Adapter / UI; Eidos File data semantics remain owned by the Runtime

This specification defines the plugin interface at the Adapter / UI boundary.
Eidos File format and data semantics are defined by their respective specifications.
The Chinese document is informative. MUST, MUST NOT, SHOULD, and MAY express
requirements of this contract.

## 1. Purpose and conformance

A plugin contributes views, user-invoked actions, or document formatters. A View
has exactly two kinds: `page` and `file`. Text documents, media, Eidos files and
tables are accessed through capabilities. A theme is
a separate data-only package.

Views use mount entry points; extensions use activate and register their actions
and formatters. Hosts provide versioned editing and task interfaces.

Hosts MUST check required bound-data capabilities before executing a view. They
MUST NOT advertise placeholder methods which always fail as unsupported. A
host can support fewer capabilities; unsupported contributions fail compatibility
checks. Runtime revocation and per-operation permission errors remain possible.

## 2. Common identities and scope

Package IDs, contribution IDs and placement references are stable identities.
Installation is device-wide; executable enablement, settings and connection
authorization are scoped per Space. Private binary storage belongs to the
plugin on the device. Table plugin configuration belongs to the file.

Bindings describe the current resource and location; they do not grant access.
FileRef IDs are contextual display identities, not persistent file IDs or bearer
authority. A host may supply relative path/name metadata when available. In table
sessions without file metadata, `id: "current"` identifies the session's bound
file only. Plugins MUST NOT persist that value as a portable identity.

Every operation is authorized using host-owned instance, owner, Space, package
revision, contribution access and active invocation, not guest-supplied IDs.

## 3. Descriptor and source layout

A plugin supplies `plugin.json`, or a standalone TS/JS source exporting a static
`manifest`. Metadata is read without executing plugin code. Source entry paths
remain local `./` paths. Unknown fields, duplicate IDs and invalid placements
MUST be rejected. The SDK is type-only; code imports it with `import type`.

```ts
interface ViewDeclaration {
  id: string
  title: string
  entry: string
  kind: "page" | "file"
  capabilities?: Array<
    "document" | "eidos/schema" | "eidos/table" | "eidos/config"
  >
  access?: "read" | "write"
  configuration?: ViewConfiguration
  icon?: PluginIconDefinition
}
```

A page cannot request bound-data capabilities. File views can combine
`eidos/schema`, `eidos/table`, and `eidos/config`. Each declaration grants only
its corresponding member under `capabilities.eidos`; the parent namespace grants
no implicit access. Unknown and duplicate capabilities MUST be rejected.
`document` is for text files and MUST NOT be combined with Eidos capabilities.
A file view without bound-data declarations uses the filesystem capability for
ordinary files and media. Format detection MUST NOT grant undeclared capabilities.

`access` defaults to `read` and is a contribution-level ceiling. Page views may
explicitly declare write access when they also have the required workspace grant.
Action declarations retain `context: workspace | file | document | table` and
`access`; these are invocation requirements, not View kinds.

Executable packages for Lite require `requires.pluginApi: "3.0.0"`. Serve
supports this same API major with a narrower table capability profile. A version
number alone never grants features or permissions. Existing API 1.x/2.x executable
packages require source migration; hosts MUST NOT pretend they use the new context.

### Theme plugins

Themes declare `kind: "theme"`, `theme: { stylesheet: "./theme.css" }` and contain
no executable contributions, settings or grants. Light/dark semantic tokens and
local embedded fonts are validated by the theme parser. Themes are selected
host-wide, not enabled per Space. The unchanged data-only API 1.6.0 theme contract
remains supported in Lite; CLI Serve does not support host themes.

## 4. Entry points, SDK and lifecycle

A view default-exports `mount(ctx, root)`. An extension default-exports
`activate(ctx)` and registers its declared actions/formatters before activation
completes. Registrations are staged and failed activation does not publish a
partial set. Both entry points may return a Disposable, synchronously or through
a Promise. No direct-action-entry migration is required.

```ts
interface ViewContext {
  readonly binding:
    | { kind: "page"; route: string }
    | {
        kind: "file"
        file: FileRef
        location?: { kind: "eidos-table"; tableId: string; viewId: string }
      }
  readonly capabilities: ViewCapabilities
  readonly signal: AbortSignal
  readonly subscriptions: { add<T extends Disposable>(value: T): T }
}
```

All operations start at `ctx.capabilities`; no top-level `fs`, `ui`, `editor`,
`table`, `eidos`, `storage`, `network` or `settings` aliases exist. Binding contains
identity/metadata only. The declared bound-data object is exposed as
`capabilities.document` or the declared members of `capabilities.eidos`.

Lite additionally supplies scoped `fs`, `network`, `storage`, `settings`, and
`ui` services. Declared connections are available through `capabilities.connections`. Grants are still validated for each call. Serve exposes `eidos.table` and
notification operations only. Accordingly shared SDK service members are optional
where a host may omit them. Consumers narrow before calling an optional member.
`TextFileViewContext` and `TableFileViewContext` are convenience type combinations,
not new View kinds or a source of authority.

Views expose settings.get only. Lite action invocations additionally support
settings.set/reset.
HostUI provides notify; openFile/navigate are optional host operations. Paths to
openFile are interpreted and authorized by the host, not native handles.

ExtensionContext exposes actions and formatters under `capabilities`; it does
not expose an unavailable settings service. ActionContext binds file identity
and supplies `capabilities.document` for document actions. Table provider contexts
expose `eidos.table` (identity and readContext) and `eidos.config` (read only) under
`capabilities`. getItems receives only these Eidos members and signal; run adds
`target`, `task` and `connections` under `capabilities`. Provider configuration
reads are restricted to the bound table and plugin namespace.

Capabilities and observations belong to the session/invocation. Disposal aborts
work and releases subscriptions; late calls fail. Plugins MUST dispose React
roots and other owned resources and ignore results after cancellation. Observers
MUST NOT block unrelated observers; terminal errors terminate only the affected
subscription. Initial document snapshots and subsequent events retain their
existing ordering contract.

## 5. Source loading and offline packages

The compiler statically checks declarations/types and bundles browser modules;
it MUST NOT execute plugin code, build configuration or install scripts. External
dependencies require a matching installed identity and supported lockfile.
Dependency checks do not authenticate publishers.

Packages remain bounded gzip UTF-8 JSON with `format`, `manifest`, and `modules`.
Declared entries and module coverage must match. Compressed and decompressed
payloads are limited to 16 MiB. Duplicate JSON keys, invalid module syntax and
external module imports are rejected by the shared packager. Format 2 carries
`requires`; format 1 must not carry it. Hashes identify exact package bytes.
Old hosts must reject new incompatible manifests rather than substitute old APIs.

Source changes are checked before remount. Failed candidates retain/restore the
last working code. Manifest authority changes require renewed review. Automatic
source updates are ephemeral; installation persists an accepted package revision.
Code rollback does not undo data writes or external side effects.

## 6. Views, placements and routing

Navigation and plugin/settings placements target pages. file/open targets file
views other than table-bound views; table/view targets a file view requiring
`eidos/table`. File/open views declaring `eidos/schema` or `eidos/config` use only
the `.eidos` extension. Document
capability cannot claim binary `.eidos` files. Ordinary file views can stream
media without a media View kind.

Placements, command palette, context menus, toolbars and shortcuts reference
declared contributions. They grant no additional authority. Table bindings carry
an Eidos-table location; the host validates all table operations against its
trusted bound table/view. Page routes are opaque plugin-owned strings, not
filesystem paths. Saved view IDs, routes and default-editor associations SHOULD
survive source migration unchanged.

## 7. Resources and authorization

The filesystem capability provides readText/writeText, readBinary/
writeBinary, list/stat, delete/rename, getUrl and watch. Lite mediates canonical
paths, scope, protected files and I/O. Text is bounded to 2 MiB, binary data to
16 MiB. Stream URLs are host-issued and do not expose native handles.

File-backed contributions have a confined file-directory/companion
scope. Broader Space access requires `workspace.files`; a workspace action's
context alone grants nothing. Writes also require the active contribution's
`access: "write"`; a package-level workspace write grant MUST NOT make a read-only
contribution writable. Permissions are an intersection of declaration, grant,
contribution and lifetime. Old resource declarations remain unsupported in Lite.

Direct filesystem writes, binary writes, delete and rename MUST NOT bypass an
existing plugin-service working copy: they fail BUSY and callers use document
editing/save. This is not a universal cross-process transaction guarantee. Direct
filesystem methods are not optimistic editing APIs; collaborative text editing
must use the working-copy capability.

Private storage provides list/read/write/delete, declared quota, atomic serialized
writes, 4 MiB per object, and a maximum of 25000 objects. Anonymous network reads
remain bounded HTTPS requests to declared origins, without exposing credentials.

## 8. Text documents and editing

Document capability provides read, observe, edit, save, undo and redo. edit accepts
`{ text, expectedVersion, label?, group? }`, changes the host working copy, and
returns applied or stale with a snapshot. save returns saved or conflict with a
snapshot. Stale edits MUST NOT overwrite newer text. Disk conflicts preserve the
draft; callers MUST NOT silently retry with a newer version. Encoding, BOM,
newlines and explicit save semantics remain intact.

The host owns shared undo/redo and recoverable drafts. A plugin MUST NOT replace
this with direct filesystem writes simply because its context path changed.
A formatter registers through `capabilities.formatters`; it receives text/path/
signal and returns text. The host checks version/context before applying an
undoable edit. Formatters do not receive a document write handle.

## 9. Structured data and output

Eidos operations are grouped by responsibility under `ctx.capabilities.eidos`:

- `schema`, declared as `eidos/schema`, supplies `listTables()` and
  `readTable(tableId)` for the entire bound Eidos file. It grants schema reads,
  including from table-bound views; it does not grant row access.
- `table`, declared as `eidos/table`, supplies readContext/readRows/aggregate/
  setViewConfig/openRecord/watch for the current table and saved view.
  It requires a table binding; caller-supplied IDs cannot rebind it.
  `setViewConfig` replaces `view.properties.plugin`; callers merge retained keys.
- `config`, declared as `eidos/config`, supplies `read(tableId)`,
  `write(tableId, { value, expectedVersion })` and `watch(tableId, listener)`.
  It accesses only the calling plugin's configuration namespace. A file binding
  can select a table within that file; a table binding restricts configuration to
  that table even when `eidos/schema` is also declared.

Config writes require contribution write access, an expected version and host
mutation permission. They preserve other namespaces and unknown settings.
Config observation is a disposable invalidation hint, with no initial snapshot;
it may include unrelated changes. Read initially and reread on notifications.
The host MUST notify on successful config writes and bound-file invalidation,
and stop delivery after disposal. Declaration order MUST NOT change semantics.

Query scope, field IDs, derived values and validation remain owned by Eidos File
Runtime. Plugins receive no SQLite handles. Lite supports all three members;
Serve supports only `eidos/table`. A required unsupported member fails host
compatibility checks before mounting.

## 10. Settings, host interaction and presentation

Settings remain per Space/plugin. Unknown stored values are preserved during
read-modify-write. Private caches and encrypted credentials remain device-local;
table plugin configuration travels with the file. Interface CSS uses injected
semantic theme variables; framework libraries are bundled by the plugin.

Dynamic table actions retain activate/registerTableProvider, getItems and run.
The host freezes target membership and issues read tokens. Plugins paginate the
whole target, recheck fields, honor cancellation, and update only the authorized
output scope. `task.declareOutputs` validates output samples and establishes writable output fields.
It returns `Promise<void>` and rejects invalid samples. Each run declares outputs once,
before writing. Samples use live read tokens, share the same set of output fields,
and must match subsequent writes to those sampled records. `task.report` reports progress.
Writes are incremental; cancel does not roll back completed rows. Undo/redo uses
host-owned conflict-checked values, not replay of external requests.

`ctx.capabilities.connections` is independent of Eidos data capabilities. Lite
views and ordinary action invocations expose isConfigured/request; table action runs
expose request. Calls require a declared connection and a live context. Ordinary
action requests MUST bind to the invocation identity and abort when it ends; a
subsequent invocation MUST NOT revive stale handles. Connections remain host-owned,
scoped credentialed requests with bounded data,
concurrency and lifetime. Configurable model-service connections use the endpoint, model and credentials
configured by the user in the host. Secrets never enter plugin code, file settings, packages
or diagnostics. Timeout does not prove an external side effect did not occur.

## 11. Execution isolation and failures

Guest code runs in an isolated container, never a host-side import/eval/Node VM.
The document sandbox uses allow-scripts without same-origin authority. CSP denies
undeclared network, scripts and native APIs. Optional workers/origins are declared
and validated; WebAssembly obtains no additional host authority.

Host checks bind owner, Space, revision, contribution and invocation on every
request. Activation/mount deadlines, invocation cancellation, 64 pending RPC
limits and bounded payloads are retained. These are cooperative deadlines; they
do not promise preemption of a synchronous loop or independent renderer crash
containment. Hosts MUST state the isolation they actually provide.

Stable error codes include INVALID_REQUEST, UNSUPPORTED_API, PERMISSION_DENIED,
INSTANCE_CLOSED, STALE_REVISION, ALREADY_EXISTS, BUSY, TOO_LARGE, IO_ERROR, TIMEOUT,
CANCELLED, REGISTRATION_CONFLICT, DEPENDENCY_MISSING and SOURCE_INVALID. Text
edit/save conflict results remain typed. Diagnostic text is untrusted and must
not include document bodies or secrets by default.

## 12. Authoring, agent access and revision acceptance

plugin-tools owns create/templates/check/pack. CLI plugin commands manage and
inspect packages; authoring commands are not aliases. Checks use the actual
host profile. Passing compilation is not runtime verification. Agents preserve
user source, IDs, data, settings and lockfiles and report the exact tested host.

Migration changes declarations and context access paths, not the file format or
stored plugin namespaces. Activation, task.declareOutputs, configuration keys and data
schemas need not change. If an individual plugin changes its own schema, it must
provide a tested migration and downgrade policy. Plugin authors own migrations of their stored data. Task writes are incremental.

## 13. Reference scenarios and conformance tests

Conformance requires testing the advertised profile, including:

- Page navigation and file/open placement with only page/file View kinds.
- Text edit/save/reopen, undo/redo, stale edits and external disk conflict.
- Generic file/media streams without implicit text/Eidos capability injection.
- Table query/config scope, target pagination, cancellation and partial undo.
- Missing/unsupported data capabilities rejected before activation.
- Composed Eidos declarations are order-independent; undeclared subcapabilities
  cannot be used through forged requests.
- Schema access cannot broaden table queries or plugin configuration scope.
- Config observers receive write/external invalidations and stop after disposal.
- Connections work independently of Eidos and expire with their invocation.
- No top-level capability aliases or binding objects containing operations.
- Read-only contributions remain read-only under package workspace grants.
- Direct writes cannot bypass an existing plugin-service working copy.
- Dispose/remount leaves no live handles or duplicate action registrations.
- Shared table-view code runs in Lite and Serve with host-specific optional APIs.
- Old executable requirements/manifests fail without replacing a working install.

## Plugin compatibility contract

Both source-tree hosts advertise executable API 3.0.0. The feature inventory in
`packages/plugin-runtime/src/compatibility-data.json` is shared by TypeScript and
Rust checks. View kinds produce view.page/view.file; declared bound-data
capabilities produce data.document, data.eidos/schema, data.eidos/table and
data.eidos/config; generic file views
require data.file support. Themes retain their
independent unchanged contract. Legacy format-1 diagnostics may report an
undeclared requirement; that is not an API 3 conformance claim.

SDK package, plugin package and host product versions are independent. check
--target must reject unsupported features; doctor output must be inspected for
compatible:false. Release availability must be reported separately from this
source-tree implementation. No publication is implied by a passing local build.
