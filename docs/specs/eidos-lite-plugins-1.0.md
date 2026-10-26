# Eidos Plugins — API 3.7

Status: Normative source-tree contract; release availability is determined by the installed host

Plugin API: 3.7.0

Canonical language: English

## Localization

API 3.7 supports `i18n: { defaultLocale, messages, readme? }`. `messages` maps
canonical BCP 47 locale tags to local `.json` paths; `readme` maps tags to local
`.md` paths. Each supplied map MUST contain the default locale and 1–32 locales.
Paths MUST begin with `./`, remain inside the source root, and contain no symlink,
parent traversal, URL, query or fragment. Each resource is UTF-8 and at most 1 MiB.
Message files contain at most 4096 string entries; keys match
`[a-zA-Z][\w.-]{0,127}`, values contain at most 4096 UTF-16 code units and no
control characters. Empty translations are permitted.

An entire display string matching `%key%` references a message. Supported fields
are plugin name/description, View/action/formatter/hook/template titles, setting
titles/descriptions (including View configuration), and connection titles.
Other fields, including IDs, paths, permissions, URLs, defaults and enum values,
MUST NOT be localized. Every referenced key MUST exist in the default dictionary;
checking and decoding MUST reject missing default messages. Literal strings and
packages without `i18n` retain their original behavior.

The host supplies its resolved language, not the raw “system” setting. Resolution
tries the exact tag, language plus script, base language, then the plugin default.
For Chinese, inferred script distinguishes Simplified and Traditional; matching
MUST NOT cross scripts, except when the author explicitly chooses such a default
or supplies a generic `zh` resource. A missing message falls back independently.
README resolution selects one whole document, never paragraphs from multiple
languages. When the default document is used because no requested-language
candidate exists, the host MUST disclose its actual language. Unknown legacy
document languages MUST NOT be guessed.

Views, extensions, action invocations, table-action discovery and table-action
runs receive `ctx.i18n` with `locale`, `t(key, values?)`, and
`onDidChangeLocale(listener)`. Messages interpolate named `{parameter}` values
as plain strings; there is no HTML, pluralization or ICU evaluation. Missing
runtime keys return the key. Observers return disposables. Hosts deliver language
changes to mounted guests without remounting, changing routes, or restarting a
background. Action invocations and table-action runs capture their starting
language. Backgrounds do not receive this presentation API. Source manifests and
package hashes remain unchanged by language selection.

Localized packages require `requires.pluginApi >= 3.7.0` and envelope format 3:
`{ format: 3, manifest, modules, resources }`. `resources` maps exactly the declared
paths to UTF-8 contents. Undeclared, missing or oversized resources are rejected;
the existing 16 MiB compressed/uncompressed package limits still apply. Formats
1 and 2 remain supported. Source watches and revision hashes include resources.
Older hosts reject the new format instead of executing unresolved declarations.

Installed documentation MUST come from the installed package revision. Market
documentation comes from the checksum-verified release archive; caches are keyed
by its immutable hash, and language selection occurs within that archive. Legacy
README retrieval uses the release tag and a hash-specific cache, never a mutable
branch; if the installed version differs from the catalog, unrelated documentation
MUST NOT be substituted. Registry tooling derives localized display metadata from
the same package dictionaries. Markdown remains subject to host sanitization;
relative image assets are not implicitly bundled by these text resources.

## Background host services

API 3.6 accepts optional `background.autoStart: true`. Lite MUST attempt startup
when an enabled plugin's Space opens and when that plugin is enabled. Startup uses
the same singleton and permissions as explicit startup. Approval MUST disclose
automatic startup and be stored per Space and exact package hash. Disabling revokes
approval; a changed package requires renewed approval. Manual stop or failure MUST
NOT trigger automatic retries within the Space session. Closing the Space ends
the run. Automatic startup does not restore memory or grant Bluetooth devices.

`ctx.events` is the background host-event entry point; initially only `file.opened` is supported. The event name determines the callback type. Unknown events, invalid listeners and undeclared permissions throw synchronously; subscribing never starts a background. Each subscription disposes independently, and a throwing listener does not prevent other listeners from running. Events are live only, without durable delivery or replay; stopping the background destroys its subscriptions. Views and actions do not expose this interface yet; use the existing background messaging API to obtain background state.

Lite API 3.6 injects `globalThis.ctx` (`BackgroundHost`) into background modules.
`spaceId` identifies the current Space; `instanceId` is unique to the run.
With explicit `background.fileHistory: true`, `ctx.events.on("file.opened", listener)` observes
successful workbench opens in that owner window and Space. Each event contains a
host-generated `id`, Space-relative `path`, and Unix-millisecond `timestamp`.
The host MUST disclose path/time observation during background approval, exclude
protected implementation paths, reject subframe reporting, and revalidate the
owner/Space and plugin revision before delivery. Failed opens, content reads,
resource previews and View rerenders MUST NOT emit opens. Delivery starts only
for running, granted backgrounds; no historical replay or automatic start is
implied. Disposal removes the listener; revocation and termination end delivery.
This permission MUST NOT grant file contents or filesystem access.

With `storage.maxBytes`, background `storage` exposes the existing plugin-private
binary object API and quota. Hosts MUST enforce the current plugin grant, serialize
storage operations with View/action operations, atomically replace written objects,
and reject writes after revocation. Storage is device-local, plugin-scoped and shared
across Spaces; read-modify-write is not a transaction. Plugins must partition keys
as needed. Timers provide no persistence guarantee: unflushed state can be lost on
termination. `background.isRunning()` MUST NOT start a worker or request permission.
Private host-service frames MUST NOT reach application message observers.

Owner: Adapter / UI; Eidos File data semantics remain owned by the Runtime

## Bluetooth grants

`background.bluetooth: true` requests GATT access to the device explicitly selected
by the user. It MUST NOT grant access to other devices or start a connection by itself.
`background.bluetooth: { services: [...] }` optionally restricts services. A service
entry with no operation fields allows supported read/write/notify operations; if
any operation field is present, only fields set to `true` are granted. Manifest
device IDs are forbidden. Normal background startup grants no Bluetooth device.
The host MUST describe broad device access during selection, and revoke grants
when the run stops. Cancelling selection preserves the current run; confirming
a device replaces it. Device capabilities and BLE GATT transport limits still apply.

## Worker Fetch

Lite plugins requiring API 3.5 or later MUST use a host-mediated global `fetch`
in page/file Views and ordinary command invocations. Backgrounds expose the same
Worker-style Fetch surface: Request, Response, Headers, Blob, File, FormData,
URLSearchParams, Body methods, readable response streams and AbortSignal.
CLI Serve retains its browser networking contract and does not advertise API 3.5.
Earlier Lite plugin requirements retain their browser networking behavior.

View and command network declarations use `browser`; backgrounds use `background`.
`network: true` requests public HTTPS access (and WSS in backgrounds), subject to
explicit host approval. Optional `networkOrigins` restricts the grant and MUST
take precedence, including an empty array which denies all destinations. An
origin list alone remains valid; omitting both fields denies networking.
`browser.network: true` requires API 3.5 or newer. These grants MUST NOT imply each other.
The host MUST validate the initial URL and every redirect, pin a vetted DNS
address, deny private/reserved destinations, filter forbidden request headers,
strip credentials on cross-origin redirects, and omit response Cookie headers.
No browser CORS check, cookie jar, login session, persistent HTTP cache or Service
Worker participates. Request credentials/cache/referrer options do not grant
ambient browser authority. Authorization headers remain explicit request data.
Fetch-managed View frames MUST block direct external connections through CSP.
Blob workers in those frames do not receive the host RPC channel.

`fetch` MUST resolve on response headers. HTTP error status codes are successful
Response values; network failures reject. `redirect: manual` returns an opaque
redirect response. Integrity metadata using SHA-256/384/512 MUST be verified
before exposing a response; this requires buffering. Body consumption is single-use;
clones use stream tee semantics. Response streams MUST pull from the host on demand,
with bounded chunks and queues, and support cancellation after headers. Closing a
View or ending an action MUST close its fetch resources without stopping an
independent background. Stopping a background MUST close its network resources.

Hosts MAY enforce resource limits. Current uploads are buffered, limited to
1 MiB, including ReadableStream inputs; response streams are not subject to the
old 1 MiB aggregate response limit. QuickJS buffered body helpers are limited to
16 MiB and the JS heap/turn budget. Network chunks are at most 16 KiB. Each caller
has at most 16 fetch resources (backgrounds share the limit with WebSockets).
Headers are limited to 128 request fields / 32 KiB. Header wait, read wait and
unconsumed body idle deadlines are 30 seconds; active streams can run longer.
The final-header deadline MUST include DNS, connection establishment and the
entire redirect chain; redirects MUST NOT reset it.
Callers MUST consume or cancel response bodies. This is a Worker profile of the
Fetch API, not a claim of complete browser/WPT conformance.

This specification defines the plugin interface at the Adapter / UI boundary.
Eidos File format and data semantics are defined by their respective specifications.
The Chinese document is informative. MUST, MUST NOT, SHOULD, and MAY express
requirements of this contract.

## 1. Purpose and conformance

### Background startup and output

Initial background approval MUST be cancellable and bounded to five minutes.
Stopping, revoking, or closing the initiating caller before readiness MUST cancel
startup; late approval MUST NOT create a process. Approval wait MUST NOT consume
the ordinary command execution deadline. Once ready, the run remains independent
of its initiating View or command.

Output MUST NOT have a lifetime byte ceiling. Frames remain limited to 1 MiB.
The QuickJS host permits 16 MiB of messages per one-second window; exceeding this
rate terminates the run. Logs have a separate 1 MiB window and MUST be dropped on
rate overflow without terminating the run. The Node SDK enforces a separate
32 MiB per-second limit on each output pipe, plus bounded frame assembly.

### File hooks

API 3.3 adds optional `hooks` declarations: `{ id, title, event, extensions,
access? }`. `event` is `document.saved` or `file.renamed`; `access` defaults to
read-only. Hooks require an extension entry and `requires.pluginApi: "3.3.0"`
or newer. Extensions register handlers with `capabilities.hooks.register` during
activation and add the returned disposable to `subscriptions`.

The handler receives `{ event, settings, signal }`. Events contain `type`,
`operationId`, `source`, Space-relative `path`, and `document: { text, version }`.
Saved events include `previousText`; renamed events include `previousPath`.
Hosts MUST dispatch only after successful local saves or local renames, and
MUST NOT dispatch for opens, installation, enabling, incoming synchronization,
or hook-generated mutations. A write hook MAY return `{ text?, name? }` for the
event document only; `name` is a portable leaf filename retaining the extension
and existing folder. Hooks receive no filesystem, database or network APIs.

Hosts MUST reject unknown plan fields, non-text or text above 2 MiB, invalid
filenames, extension changes, stale document versions, and existing rename
destinations. A skipped or failed hook MUST preserve the successful initiating
operation. Hosts MUST isolate plugin execution, bound time, verify
that the same plugin revision is still enabled, and dispose its resources.
Desktop hooks run in a separate sandboxed renderer; native hooks run in an
isolated QuickJS VM with a 32 MiB memory limit. Hook code MUST NOT depend on DOM, browser or Node globals.

The first effective write plan wins, ordered by plugin ID and then declaration
order. Hosts maintain Markdown references during a rename, using version checks
for linked documents and preserving outstanding drafts. Editors MUST follow
the resulting path without remounting or discarding concurrent typing. Lite
supports editable text files; Android and iOS support `.md` and `.markdown`.
CLI Serve does not implement hooks. Disabling a plugin stops future events;
enabling one MUST NOT bulk-reconcile existing files.

### File templates and resource composition

Lite API 3.2 supports optional `fileTemplates`: an array of `{ id, title,
extension, view, content }` declarations. Each template MUST reference a
document-capable file View with a matching `file/open` extension. Content is
static UTF-8 text limited to 256 KiB; `.eidos` is reserved. The host MUST list
only enabled plugins' templates, create files exclusively without overwriting,
and open the declared View after creation. Creating a file MUST NOT execute
plugin code. The filename and destination remain user choices.

File Views with Space file read access MAY receive `ui.resources` with
`listViews(path)` and `mount(element, source)`. A source is `{ kind: "file", path }`
or `{ kind: "eidos-view", path, tableId, viewId }`. Paths resolve relative to the
bound file, MUST remain within the current Space, and MUST pass the host's
filesystem containment checks. File sources MAY specify `editor`, either a
matching enabled plugin's `pluginId/viewId` or `"builtin"`; omission preserves
the built-in preview. For ordinary files, `listViews` returns
`{ kind: "file", editor, name, type }` choices from enabled matching file/open
placements and the built-in preview. For Eidos files it returns table and saved-view IDs,
names and view types. Explicit plugin choices MUST be revalidated at mount time,
rendered read-only, and disposed with their parent resource.
It does not grant a Runtime session or another plugin's
capabilities. These APIs are optional and currently provided by Lite only.

`mount` returns a disposable handle with `refresh(): Promise<void>`. The host
MUST render the resource in a trusted surface clipped to the guest viewport
and requested rectangular container. Containers support ordinary layout and
scroll clipping; rotation, transforms and overlapping interactive overlays are
not supported. The host MUST clip resources beneath the most recently opened
native HTML popover, allowing one rectangular menu without changing resource layout.
Dashboard authors SHOULD keep persistent controls outside resource containers.
When the mounted container's computed `pointer-events` is `none`, the host MUST
make its resource surface ignore pointer input so layout gestures can cross it.
Restoring the style restores pointer interaction.

File document Views MUST support Cmd+S / Ctrl+S through the host document save
operation. The sandbox supplies a default handler when the View has not consumed
the shortcut. Lite forwards Save from the workbench and embedded resources to
the enclosing file View. Views that consume it MUST flush pending edits before saving.
Guest code MUST NOT receive child frame URLs, tickets or Runtime session IDs.
The host MUST keep the sandbox's `frame-src 'none'` restriction.

Composition is read-only, limited to 12 resources per parent and one level deep.
Ordinary file resources use trusted text, Markdown and image previews; nested
dashboard files are unsupported. Eidos resources reuse saved-view query semantics
and existing renderers. Plugin views require their own enabled grant, receive
`presentation.mode: "embedded"`, and MUST NOT gain write authority through
composition. Parent closure/disposal MUST close child plugin instances, and
revocation MUST make their interfaces unavailable. Missing resources and disabled
plugins MUST fail locally without replacing other panels. Refresh retries an
existing reference; failed refreshes retain the previous content. Eidos views
receive Space invalidations; ordinary previews can be refreshed explicitly.

The dashboard configuration is a plugin-owned ordinary JSON document. Its layout
is edited through the document working-copy API, including version checks,
save, undo/redo and external-change conflicts; it adds no Eidos File semantics.

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

Lite associates `.eidos-plugin` archives with the desktop host. Opening an archive
from the operating system, including during startup, MUST enter the same package
validation and confirmation flow as installation from Plugin settings. An existing
manifest ID selects Update and displays the installed and incoming versions when
they differ. Cancellation or invalid packages MUST leave the installed revision
unchanged. Opening an archive MUST NOT implicitly enable it in a Space; updates
preserve existing Space enablement. Multiple shell-open requests are processed
sequentially.

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

The manifest MAY include `description`, a nonempty plain-text summary on one line,
with at most 1024 UTF-16 code units and no ASCII control characters. The parser
MUST preserve it in the packaged manifest. Lite displays the installed manifest's
description in plugin lists and details, falling back to the plugin's marketplace
description when absent. Hosts MUST render descriptions as text, not HTML. Without
either description, Lite omits the summary instead of substituting generic copy.

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
notification and generated-file export operations. Accordingly shared SDK service members are optional
where a host may omit them. Consumers narrow before calling an optional member.
`TextFileViewContext` and `TableFileViewContext` are convenience type combinations,
not new View kinds or a source of authority.

Views expose settings.get only. Lite action invocations additionally support
settings.set/reset.
HostUI provides notify; openFile/navigate are optional host operations. Paths to
openFile are interpreted and authorized by the host, not native handles.

View hosts MAY expose `capabilities.ui.exportFile({ name, mimeType, data })` for
generated files. `name` MUST be a portable base filename without a path;
`mimeType` MUST be a media type without parameters; `data` MUST be a Uint8Array
of at most 16 MiB. This operation grants no filesystem or bound-data write
authority and is available to read-only Views. Lite asks the user for a native
save destination and returns `{ status: "saved" }` after a successful write or
`{ status: "cancelled" }` when dismissed. Serve initiates a download in the
trusted parent page and returns `{ status: "download-started" }`; this does not
confirm persistence. Hosts MUST validate the request before opening a dialog or
starting a download. Lite MUST reject overlapping exports for an instance and
recheck instance lifetime and the plugin grant/revision after destination
selection, before writing. Failures reject the promise. Unsupported hosts omit
the method; plugins MUST check its presence and display actionable feedback.
Guest iframe download permissions remain disabled. Mobile hosts and action
invocations do not currently expose this optional operation.

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

Packages remain bounded gzip UTF-8 JSON with `format`, `manifest`, and `modules`;
format 3 additionally contains the declared localization `resources`.
Declared entries and module coverage must match. Compressed and decompressed
payloads are limited to 16 MiB. Duplicate JSON keys, invalid module syntax and
external module imports are rejected by the shared packager. Formats 2 and 3 carry
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

Lite supports `sidebar/explorer` placements referencing page Views. The contribution MUST replace the complete explorer surface, including the Space heading and explorer toolbar; the host MUST NOT prepend its built-in heading, search, sort or creation controls to an active replacement. Window navigation and application controls belong to the host shell outside this surface. The user selects one replacement per Space through Plugin Manager and can return to the built-in explorer. Hosts MUST validate the declared placement and enablement before mounting. Unavailable or failed replacements MUST restore the complete built-in explorer, including its heading, with recovery actions. Temporary host text-search overlays MUST retain the mounted replacement and its browsing state. The sandbox, contribution access, revision checks and disposal contract also apply to sidebar Views. Only this placement receives `capabilities.explorer`: `read()` returns `{ rootDirectory, activePath, sort }`; `watch(listener)` invalidates that display state and returns a disposable subscription without an initial callback. Paths are Space-relative; null root denotes the Space and null activePath denotes no file. This context grants no filesystem authority. File opening uses `ui.openFile` and the host's normal editor selection.

Lite API 3.1 supplies the standalone `ctx.capabilities.filemeta` capability with `read(path, namespace)` and `patch(path, namespace, { set?, remove? })` through sqlite-fs-meta's native namespace API. `workspace.filemeta` declares an explicit nonempty list of at most 16 unique namespaces and optional `write: true`. Namespaces use ASCII letters/digits initially, followed by letters/digits, `.`, `_` or `-`, up to 255 bytes. Read scope is the bound file unless `workspace.files` grants Space reads. Writes additionally require both property write permission and contribution `access: "write"`; this grant does not grant file-content writes. Reads return the entire JSON object, including keys absent from files.eidos, or `{}` for an absent namespace. Patches preserve other keys; null is a value and `remove` deletes keys. Set/remove overlap, invalid keys, non-JSON values and patches over 1 MiB MUST fail before writing. Keys are nonempty, exclude NUL and are bounded to 1024 bytes; patches contain at most 1024 keys and nesting depth 32. Native storage limits may be smaller. Corrupt envelopes MUST NOT be silently replaced. The host validates Space paths and rejects symbolic links, directories and missing files; Unix writes reject multiple hard links. Property calls are immediate filesystem operations, not Eidos File transactions or a cross-process concurrency guarantee. Changes invalidate filesystem watches. These capabilities are Lite-specific; unsupported hosts reject their declarations during compatibility checks.

The filesystem capability provides readText/writeText, readBinary/
writeBinary, list/stat, delete/rename, getUrl and watch. Lite mediates canonical
paths, scope, protected files and I/O. Text is bounded to 2 MiB, binary data to
16 MiB. Stream URLs are host-issued and do not expose native handles.

Lite API 3.1 `fs.list(folder, options?)` accepts `recursive` (default true) and `includeDirectories` (default false), as well as the existing extension filter. `recursive: false, includeDirectories: true` MUST return the current directory level including empty directories; extension filters apply only to files. FileStat may expose `modifiedAtMs` for sorting. Workspace permission is still required to enumerate arbitrary directories; bound-file companion listing does not grant directory traversal.

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
and must match subsequent writes to those sampled records. Their canonical JSON
representation is bounded to 4 MiB in UTF-8. `task.report` reports progress.
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

Lite advertises executable API 3.3.0; CLI Serve advertises API 3.0.0. The feature inventory in
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
