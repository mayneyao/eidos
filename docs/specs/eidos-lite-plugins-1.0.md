# Eidos Plugins 1.0

Status: Final Eidos Standard Profile  
Version: 1.0  
Published: 2026-09-17  
Editor and change controller: Eidos Project  
Canonical language: English  
Owner: Lite Adapter / UI; structured data semantics remain owned by Eidos File data engine

## Abstract

Eidos Plugins defines the extension and application model for Eidos Lite. It establishes
an isolated, sandboxed execution environment where plugins can contribute custom views,
actions, background document formatters, dynamic table action providers, and scoped
resource access across text files, directories, and .eidos structured data databases.
Conforming plugins can be loaded directly from source during local development or packaged
into immutable, offline-capable distributables.

## Status of This Document

This is the normative Eidos Plugins 1.0 specification. The key words **MUST**, **MUST NOT**,
**REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**,
**NOT RECOMMENDED**, **MAY**, and **OPTIONAL** are interpreted as BCP 14 terms only when
written in capitals, as specified by RFC 2119 and RFC 8174.

English is canonical; the Chinese document is an informative reference.

## 1. Purpose and conformance

A plugin adds interfaces and operations to a user's workspace, whether authored
by a developer or generated and iterated by an agent. Local authoring is
source-first: write code, load it, inspect behavior, change it, reload. Packaging
is a distribution operation, not a prerequisite to trying a plugin.

There are exactly two UI contribution kinds:

- **View**: an interface mounted by the host, bound to a page, text document or
  table-view data context.
- **Action**: a user-invoked operation with a declared context and data authority.

A **theme plugin** is a separate, data-only plugin kind. It changes the Eidos Lite
host interface through validated semantic tokens and optional local fonts. It is
not a View or an Action and does not style an individual plugin's UI.

Placements expose contributions in host UI. Resources describe requested data
access. Settings describe configuration. They are not additional plugin kinds.
CSV editors, Markdown editors, Journals, personal sites, import/export operations
and custom `.eidos` views MUST fit these primitives.

Plugins may additionally implement host-defined providers. A formatter supplies
the host's Format Document operation; it is not a separate plugin type or a
plugin-owned action/shortcut. General actions and placements remain available.

A conforming Lite host implements all sections below, including the reference
scenarios and conformance cases. A partial or non-conforming implementation MUST NOT claim
Plugin 1.0 support. CLI and authoring tools conform separately to section 12.
Individual plugins need implement only their declared contributions. Optional
third-party renderers, hosting services or browser-only hosts are not implied.

Excluded in 1.0: native/Node access, arbitrary network or shell calls, scheduled
background jobs, plugin-to-plugin services, user-defined permission names,
embedded Markdown renderer slots, arbitrary workbench DOM access,
and remote deployment. Local site generation is supported through output grants;
public hosting requires a future explicit contract.

## 2. Common identities and scope

Plugin identity is a lowercase dot-separated ID, e.g. `example.journals`, matching
`^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$`. Contribution/resource IDs match
`^[a-z][a-z0-9-]*$` and are unique within their respective collections. Qualified
contribution IDs are `<plugin-id>/<local-id>`. Labels are nonempty plain text,
maximum 128 characters, without control characters. Plugin versions are numeric
`major.minor.patch` without leading zeroes, prerelease or build suffixes in 1.0.
API version is the integer `1`, independent of the plugin release version.

Every active instance binds an immutable revision, canonical Space session,
contribution or extension lifetime, and grant generation. A revision identifies
content, not publisher trust. Plugins are installed in one device-wide catalog.
One installed revision per plugin ID is shared by all Spaces; 1.0 has no
Space-specific installations, version pins or global enablement inheritance.
Enablement is explicit and independent per Space, defaulting to disabled. An
installation flow MAY also enable the plugin in the current Space if that effect
is shown before confirmation. Installing without a Space only adds it to the
catalog. Updates replace the shared revision and preserve each Space's enablement,
settings and grants; they MUST NOT expand resource authority. Uninstalling removes
availability for all Spaces, ends active instances, clears their enablement and
editor associations, and revokes resource grants. Reinstallation does not restore
enablement or grants automatically.

Theme plugins are an exception to per-Space enablement: one installed theme MAY be
selected for the whole device. Selection is explicit, persists across Spaces,
and is independent of the light/dark/system appearance preference. Installing a
theme does not select it. Uninstalling the selected theme restores host defaults.

Plugin instances, settings, routes, resource bindings and grants are isolated by
Space and plugin ID. Installation MUST NOT create cross-Space execution or data
authority, nor set default editors without an explicit user choice.
Resolution: explicit choice → Space association → built-in.
Invalid defaults visibly fall back; invalid explicit choices visibly fail.
Plugin grants and enablement are local device state and never execute merely
because a synced folder or `.eidos` file mentions a plugin.

## 3. Descriptor and source layout

The canonical descriptor is `plugin.json`. A single `.ts`/`.js` source may instead
export `manifest` as a statically readable JSON-compatible object. Both forms
normalize to the same `PluginManifest`; there is no second single-file protocol.
The loader MUST read metadata without executing module code. Literals, literal
arrays/objects, `as const`, type annotations and `satisfies` are accepted; computed
properties, spreads, calls, imported values and interpolation are rejected.
If both forms are supplied, fail rather than guess precedence.

```ts
interface PluginManifest {
  apiVersion: 1
  kind?: "theme"
  requires?: { pluginApi: string }
  id: string
  name: string
  version: string
  icon?: { paths: string[] }
  storage?: { maxBytes: number }
  extension?: string
  views?: ViewDeclaration[]
  actions?: ActionDeclaration[]
  formatters?: FormatterDeclaration[]
  placements?: Placement[]
  resources?: Record<string, ResourceDeclaration>
  settings?: Record<string, SettingDeclaration>
  browser?: PluginBrowserConfig
  theme?: ThemeDeclaration
}
interface ThemeDeclaration {
  light: Record<string, string>
  dark: Record<string, string>
  fonts?: { family: string; source: string; weight?: string }[]
}
interface ViewDeclaration {
  id: string
  title: string
  entry: string
  context: "page" | "document" | "table" | "eidos"
  access?: "read" | "write"
  configuration?: ViewConfiguration
  icon?: PluginIconDefinition
}
interface ActionDeclaration {
  id: string
  title: string
  context: "workspace" | "document" | "table"
  access?: "read" | "write"
  extensions?: string[]
  icon?: PluginIconDefinition
}
type Placement =
  | { location: "navigation"; view: string }
  | { location: "file/open"; view: string; extensions: string[] }
  | { location: "table/view"; view: string }
  | { location: "plugin/settings"; view: string }
  | { location: "command-palette"; action: string }
  | { location: "file/context"; action: string }
  | { location: "table/context"; action: string }
  | { location: "view/toolbar"; action: string; view: string }
  | {
      location: "keybinding"
      action: string
      key: string
      mac?: string
      linux?: string
    }
```

An ordinary plugin requires at least one view, action or formatter. A theme
plugin instead requires `kind: "theme"`, `theme` and a minimum Plugin API of
`1.6.0`. Missing collections are empty. Unknown
fields, duplicate IDs, invalid references and unsupported contexts fail before
execution. Source entries are root-relative `./` module paths, not URLs or export
expressions. Case-sensitive supported entry suffixes are .ts/.tsx/.js/.jsx.
Imported modules may also use .mjs, including locked dependency package exports.
Paths MUST resolve inside the source root; no absolute paths, `..`, backslashes,
queries, fragments or remote entrypoints. `access` defaults to read and is valid
only for document/table/eidos view context. Workspace/page context obtains data only through
named resource grants. Actions' extensions are valid only for document actions;
file extensions are lower-case dot-prefixed ASCII alphanumerics, 1–16 characters.
`.eidos` MUST NOT be claimed by document views or text document actions. A view
with `context: "eidos"` MAY claim `file/open` with exactly `[".eidos"]`.
It receives `ctx.binding.file`, never a TextDocument or filesystem handle.
`listTables()` returns IDs and names; `readTable(tableId)` returns fields.
`readPluginConfig(tableId)` and `writePluginConfig(tableId, {value,
expectedVersion})` use the same table settings namespace and optimistic version
contract as table-bound pluginConfig. Writes require `access: "write"`.
The host MUST bind every request to the mounted file and plugin identity, reject
tables outside that file, and reject guest-supplied session/plugin overrides.
The initial API does not grant row reads, row writes, or schema mutation.

### Theme plugins (Lite Plugin API 1.6)

A theme is distributed in the same `.eidos-plugin` archive format as other
plugins and may be loaded from a `plugin.json` source during development. Its
`theme.light` and `theme.dark` maps MUST each contain 1–32 semantic token
values. The host chooses a map using its resolved light/dark appearance and
applies it to the Eidos Lite interface across all Spaces. The host MUST restore
its own token defaults when the selection is cleared, changed, or uninstalled.

Theme token names are limited to `--theme-surface`, `--theme-ink`,
`--theme-accent`, `--theme-success`, `--theme-warning`, `--theme-danger`,
`--theme-neutral`, `--canvas`, `--lite-sidebar`, `--sidebar-strong`,
`--surface-hover`, `--surface-active`, `--surface-selected`, `--ink`,
`--ink-muted`, `--ink-faint`, `--line`, `--hairline`, `--lite-accent`,
`--accent-strong`, `--accent-contrast`, `--primary-action-hover`, `--focus`,
`--control-fill`, `--control-border`, `--font-ui`, `--font-code`,
`--font-editorial`, `--font-size-ui`, `--font-size-code`,
`--chrome-header-height`, and `--control-radius`. The host validates values
before applying them. Colors must be CSS color values; font families are plain
family lists. Font sizes are 10–24 px, header height 30–64 px and control radius
0–16 px (equivalent `rem`/`em` values are accepted). CSS rules, selectors,
`url()`, `var()`, declarations and executable expressions are not accepted.

Up to four optional fonts MAY be supplied. A source project's font `source`
is a root-relative `.woff`, `.woff2`, `.ttf` or `.otf` path; packaging embeds
the bytes as a data URL after validating their format. Installed packages MUST
contain embedded font data, never remote font URLs or file paths. Font family
names and weights are validated. Theme packages MUST NOT declare modules,
views, actions, formatters, placements, extension, grants, settings, storage,
connections, workspace permissions or browser permissions. A theme has no
plugin execution context and cannot access user data or the host DOM.

For example, `plugin.json` may contain:

```json
{
  "apiVersion": 1,
  "kind": "theme",
  "requires": { "pluginApi": "1.6.0" },
  "id": "example.slate-theme",
  "name": "Slate",
  "version": "1.0.0",
  "theme": {
    "light": { "--theme-surface": "#f7f8fa", "--theme-ink": "#19212b" },
    "dark": { "--theme-surface": "#181d24", "--theme-ink": "#eef2f6" }
  }
}
```

An action declaration defines an invocable capability. Lite supports dynamic
table action providers as specified below. Plugins own their action configuration in the
table settings namespace described below; action `configuration` and `multiple`
are not accepted by the current manifest validator.

The manifest may declare `"icon": { "paths": ["..."] }` (or local file / data URL format).
Paths use a 24 × 24 coordinate system, no fill, a 2-unit stroke and round caps/joins. Color follows
the host theme. The plugin icon represents the product brand and appears in plugin lists, details,
and settings; omitted icons use the host fallback. Declare 1–16 SVG path `d` strings of at most
2048 characters each. SVG markup, external URLs and executable content are not
accepted. Icon data travels offline with the manifest.

Individual views and actions may also declare their own `icon` using the same format.
This distinguishes the specific view or editor icon (e.g. a mindmap or table editor) from the overall
plugin logo. When a view or action omits `icon`, the host falls back to `manifest.icon`, and then to
the host fallback. In file "Open with" menus and editor pickers, the view icon is displayed.

Placements MUST match context: navigation/page; file/open/document;
table/view/table; plugin/settings/page; file/context/document action;
table/context/table action. A view toolbar action matches
its view context (workspace for a page). Palette/keybinding actions are available
only when the necessary invocation context exists. Eligibility and write grants
are checked on every invocation, irrespective of placement. All actions are
invocable through host authoring tools subject to the same checks. Manifest
conditions cannot contain expressions or executable code. Host/system shortcuts
win conflicts, which are reported rather than silently overridden.

Keybindings use the host's modifier/key notation, e.g. `Mod+Alt+F`; `Mod` means
Command on macOS and Control elsewhere. `mac` overrides `key` on macOS;
`linux` overrides it on Linux. Otherwise the host uses `key`.
Only enabled, context-eligible actions register shortcuts. Repeated keydown and
IME composition do not invoke actions. Host modal dialogs suspend invocation.
Ambiguous shortcuts from multiple eligible plugins are disabled and reported;
the command palette remains available. Shortcuts and palette commands share
the same invocation path and pin the document before asynchronous activation.

`extension` identifies a default activation export and is required when actions
exist. For a single source file with inline metadata and actions, omission means
that same module. View entries always identify default mount exports. A pure view
plugin has no extension entry and needs no activation or resolve/mount wrapper.
A view may appear in multiple compatible placements.

Example: an authorized Journals page, without a controller:

```json
{
  "apiVersion": 1,
  "id": "example.journals",
  "name": "Journals",
  "version": "1.0.0",
  "views": [
    {
      "id": "journal",
      "title": "Journals",
      "entry": "./journal.ts",
      "context": "page"
    }
  ],
  "placements": [{ "location": "navigation", "view": "journal" }],
  "resources": {
    "entries": {
      "kind": "directory",
      "title": "Journal folder",
      "include": ["**/*.md"],
      "access": ["list", "read", "create", "write"]
    }
  }
}
```

The suggested folder name is UI guidance, never authorization. Bindings are
chosen by the user and are not source paths or secrets in this descriptor.

Lite Plugin API 1.3 adds a separate, explicitly declared read-only capability:
`workspace: { listMarkdownFiles: true }`. After the installation review discloses
this Space-wide filename permission, a Page View may call
`HostUI.listMarkdownFiles(folder)` for a Space-relative folder. It returns at
most 20,000 Markdown paths and a `truncated` flag, without file contents. The
same Page View may call `HostUI.openMarkdownFile(path)` to ask the host to open
an existing Markdown file, without receiving its text. Paths remain confined
to the current Space, and symlinks and protected implementation entries are
not traversed. This permission does not grant document read or write access.

Lite Plugin API 1.4 adds `workspace.countMarkdownLines: true`, which also
requires `listMarkdownFiles: true`. A Page View may pass up to 400 paths
previously returned by its own `listMarkdownFiles` calls to
`HostUI.countMarkdownLines(paths)`. The host returns each path with its count of
non-empty lines, or `null` when a file is unavailable or exceeds the text
preview limit. File contents never cross the plugin boundary. The installation
review discloses this additional Space-wide metadata permission separately.

Lite Plugin API 1.5 adds `workspace.watchMarkdownFiles: true`, alongside the
required `listMarkdownFiles: true`. An active Page View may call
`HostUI.observeMarkdownFiles(folder, listener)` for a Space-relative folder.
It returns a disposable subscription. The host coalesces filesystem changes
and invokes the listener when a Markdown file or containing directory changes
under that folder; the notification contains no file paths or contents. The
Page View must rescan with `listMarkdownFiles` to obtain current data.
Subscriptions end when the Page View closes or the plugin is revoked. The
installation review discloses this separate change-notification permission.

## 4. Entry points, SDK and lifecycle

```ts
interface Disposable {
  dispose(): void
}
interface Lifetime {
  readonly signal: AbortSignal
  readonly subscriptions: { add<T extends Disposable>(value: T): T }
}
interface CommonContext extends Lifetime {
  readonly resources: GrantedResources
  readonly settings: Settings
  readonly ui: HostUI
}
type ViewBinding =
  | { kind: "page"; route: string }
  | { kind: "document"; document: TextDocument }
  | { kind: "table"; table: TableContext }
interface ViewContext extends CommonContext {
  readonly binding: ViewBinding
}
type ActionBinding =
  | { kind: "workspace" }
  | { kind: "document"; document: TextDocument }
  | {
      kind: "table"
      table: TableContext
      rowId?: string
      instanceId?: string
      actionTitle?: string
      config?: Readonly<Record<string, unknown>>
    }
interface ActionContext extends CommonContext {
  readonly binding: ActionBinding
}
interface ExtensionContext extends Lifetime {
  readonly settings: Settings
  readonly actions: {
    registerTableProvider(id: string, provider: TableActionProvider): Disposable
    register(
      id: string,
      handler: (ctx: ActionContext) => void | Promise<void>
    ): Disposable
  }
}
type Mount = (
  ctx: ViewContext,
  root: HTMLElement
) => void | Disposable | Promise<void | Disposable>
type Activate = (
  ctx: ExtensionContext
) => void | Disposable | Promise<void | Disposable>
```

A view module exports a default Mount. The host creates its sandbox and root and
calls that function. An extension module exports a default Activate. It registers
handlers for declared actions; no second registration is needed for views.
Undeclared/duplicate action registration fails. All declared actions MUST be
registered before activation finishes; staged registrations become visible
atomically. Failure rolls back every registration and side-effect resource owned
by that activation. Module top-level side effects are confined to its sandbox.

The SDK's core package `@eidos.space/plugin-sdk` supplies type declarations;
`import type` disappears during transformation. The host installs a versioned
bootstrap inside the sandbox, constructs RPC proxies and injects context when
calling the entry export. No author-facing `connect()` or host global object is
required. Main-process objects and functions never cross the boundary directly.
Callbacks stay in the sandbox; the bridge uses opaque callback IDs and cloned,
validated values. Plugin-declared identity is not proof of sender identity.

Core SDK imports MUST be type-only in 1.0. Optional pure UI/parser utilities are
ordinary dependencies, bundled when used. Host implementations of document,
settings, authority, and data engine services MUST NOT be bundled into plugins.
The descriptor API version, not a coincidentally matching npm package version,
selects the host contract. Library versions are recorded in the source lockfile.

Minimal single-file action, with no project build step:

```ts
import type { ExtensionContext, PluginManifest } from "@eidos.space/plugin-sdk"
export const manifest = {
  apiVersion: 1,
  id: "local.trim-text",
  name: "Trim trailing spaces",
  version: "1.0.0",
  actions: [
    {
      id: "trim",
      title: "Trim trailing spaces",
      context: "document",
      access: "write",
      extensions: [".md", ".txt"],
    },
  ],
  placements: [{ location: "command-palette", action: "trim" }],
} satisfies PluginManifest
export default function activate(ctx: ExtensionContext) {
  ctx.actions.register("trim", async ({ binding, ui }) => {
    if (binding.kind !== "document") return
    const snapshot = await binding.document.read()
    const result = await binding.document.edit({
      text: snapshot.text.replace(/[\t ]+(?=\r?$)/gm, ""),
      expectedVersion: snapshot.version,
      label: "Trim trailing spaces",
    })
    if (result.status === "stale")
      await ui.notify("Document changed; review before retrying.")
  })
}
```

An extension instance is lazy, one per plugin revision per Space session. It
starts on first action invocation. Views run independently per mounted view.
Action invocation captures the selected document/table at dispatch, never a
mutable global "current document". Tab switching cannot retarget an operation.
No eligible context means unavailable, not a workspace-wide fallback.

Lite exposes command-palette placements together with built-in operations in its
command palette (default Cmd+K on macOS, Ctrl+K elsewhere; user configurable).
Only enabled plugins contribute commands. Document eligibility follows the file
currently displayed, not a retained background preview or explorer selection.
Management and page views provide no implicit document target. Eligibility is
recomputed while the palette is open; invocation captures the eligible target
before asynchronous activation. The palette is available from focused plugin views.

An extension context is only a registration/configuration context. It has no
resource or navigation API. Actions use their supplied ActionContext for data
operations. This prevents hidden background data access during activation.
Views may use their grants while mounted. Action resources expire when the
handler settles, including on failure; retaining their proxies in the extension
does not extend access. Closing a view expires its handles, not the shared
working copy.

All host registrations/handles belong to their creating lifetime even if the
author omits subscriptions.add. Manual disposal is idempotent. Stop prevents new
calls, aborts signals and revokes handles, then allows at most two seconds for
returned cleanup before destroying the container. Cleanup errors do not stop
remaining cleanup. Already committed data mutations are not reversed by disposal.
User draft preservation cannot depend on successful plugin cleanup.

## 5. Source loading and offline packages

A conforming host MUST load an authorized single source file or source directory
without an explicit build/pack step. It supplies transformation and module
resolution; a user does not need a separately installed Node environment or compiler
to run a dependency-free local TS plugin. IDE type packages and package managers
are development conveniences, not core execution prerequisites.

Source loading performs: static descriptor extraction → normalization/validation
→ local dependency resolution → immutable source snapshot → sandbox-targeted
transformation → authority review → activation/mount. No plugin code runs during
extraction, dependency discovery, or configuration processing. Arbitrary Vite,
Rollup, tsdown or package scripts MUST NOT be executed automatically.

The baseline supports TS/JS and TSX/JSX, relative ESM imports, statically analyzable
local imports, CSS, and PNG/JPG/JPEG/WebP/GIF/SVG/WOFF2 assets. JSX imports
must resolve from explicit local dependencies. Nonliteral dynamic imports,
remote imports, Node builtins, native addons, dynamic require and eval
are rejected. Dynamic code that cannot be ruled out statically is also blocked
by sandbox execution policy. A bundler is an implementation choice, not a public API.

Third-party dependencies MUST already be locally installed and locked. Supported
lockfiles are package-lock.json and pnpm-lock.yaml in 1.0; others fail explicitly.
The resolver records the reachable dependency bytes in the revision, follows only
approved dependency-store links, and never exposes those filesystem locations to
sandbox code. Missing dependencies produce a structured diagnostic and an
explicit install instruction; loading/reloading MUST NOT fetch or install them,
run lifecycle scripts, or interpret a package name as permission to execute a
host-side installer. Type-only SDK imports can use host-supplied API declarations
for check even without node_modules. Transforming TS is not full type checking.

Source edits produce a new revision. Watch mode MUST include reachable modules,
assets, descriptor and lockfile changes; it builds one consistent snapshot and
switches only after a complete successful candidate. A failed transformation
leaves the last good revision active. Debouncing and caching are implementation
details. A local source loader and offline package loader MUST converge on the
same normalized program, bootstrap contract, isolation and grant checks.

The distributable `.eidos-plugin` format is gzip UTF-8 JSON:

```ts
interface PluginPackage {
  format: 1 | 2
  manifest: PluginManifest
  modules: Record<string, string> // entry key -> self-contained ESM JavaScript
}
```

Manifest entry keys refer to modules in the package, not extracted paths. Each
entry is bundled independently; imported CSS/assets are included locally in that
entry (CSS injection/data URLs) without external dependencies at execution time. Module
keys exactly cover declared view entries plus the optional extension, with shared
entry keys permitted. A theme package has an empty `modules` map. No undeclared
executable payloads or install scripts.
Source-only descriptor conventions are normalized away before packaging.

Compressed and uncompressed aggregate size limits are each 16 MiB. Validate
before activation, including bounded decompression and duplicate JSON keys.
Packages are immutable, SHA-256 content addressed, verified on load and stored
without arbitrary-path extraction. A source revision hash covers normalized
metadata, source/dependency content and transformer/bootstrap target version;
an archive revision hashes the exact compressed bytes. Revisions are opaque and
not required to match across equivalent source/package representations. Offline
execution and local installation require neither network nor account.

### Official marketplace

The host reads `https://raw.githubusercontent.com/eidos-space/registry/main/plugins.registry.json`.
The versioned catalog (`schemaVersion: 1`) contains plugin IDs, names, descriptions,
GitHub repositories, exact versions, release tags, asset names, SHA-256 checksums,
preview flags, compatibility notes and optional manifest-format icons. Legacy
extension and theme catalog formats remain separate from this plugin registry;
they do not become Lite plugins without a valid `.eidos-plugin` package.

Installation fetches a fresh catalog, downloads the pinned GitHub Release asset,
verifies its SHA-256 and manifest ID/version, then uses ordinary package
validation and permission confirmation. Downloads are bounded (1 MiB catalog,
16 MiB package), HTTPS-only, and redirects must remain on allowed GitHub asset
hosts. Catalog browsing MUST NOT execute plugin code. A successful catalog is
cached for offline browsing; cached catalogs cannot authorize new installs.
Updates are explicit installations, with the same device-wide installation and
Space isolation rules. Compatibility notes are informational, not executable checks.

Lite's plugin list and detail pages also accept dropped `.eidos-plugin` files.
Drops use the same package validation and native permission review as the file
picker. The manifest ID determines installation or replacement, including
same-version replacement; updates preserve each Space's enablement. Multiple
files are processed sequentially. Dropped source directories are not development
installs, and invalid packages cannot replace an existing installation.

## 6. Views, placements and routing

The host mounts default view exports automatically. Root DOM belongs only to the
view sandbox. Views can use browser UI libraries but cannot access parent DOM.
Navigation pages may have internal routes; the host persists an opaque route
string per page and scopes routing to that page. HostUI.navigate(viewId, route)
can target only a declared page in the same plugin/Space; routes are bounded to
2 KiB and are never interpreted as URLs, scripts or filesystem authority.
A page's local UI state is separate from saved document content.
The initial route is available as binding.route, defaulting to an empty string.
Navigating to another route creates a new page mount/lifetime; reopening the same
view/route focuses its existing mount when one exists.

A manifest may declare `{ location: "plugin/settings", view: "<view-id>" }` to mount
a declared page view inside the plugin detail configuration surface. It grants no
additional authority and does not create a navigation sidebar entry. Lite mounts it
only when a Space is open and the plugin is enabled. Declarative scalar settings
remain a separate capability.

Document views bind one TextDocument grant. A Markdown editor can request
controlled attachments through section 7; opening Markdown alone does not grant
all neighboring files. All editor and action instances bound to the same canonical
file in a Space session use the same working copy.

Table views bind one existing file/table/saved-view data context. A host
registers a UI renderer for persisted type `plugin:<plugin-id>/<view-id>`, using
the existing open-string view type contract. Create/update saved views through
the data engine. Standard filters/sorts/hidden fields retain their existing owners.
Plugin-specific JSON lives in view properties under:

```json
{ "eidos.plugin": { "configVersion": 1, "config": {} } }
```

This namespace carries layout configuration, not executable code, installed
versions, grant tokens or secrets. Plugins MUST validate config before rendering;
unsupported config versions preserve data and show a fallback. Missing plugins
preserve unknown type/properties and expose a built-in read-only tabular fallback
or a clear unavailable view with an option to open a separate standard view.
Merely opening a `.eidos` file MUST NOT install or execute its referenced plugin.
No Eidos File schema change is introduced; this profile uses existing custom
view metadata and data engine operations.

## 7. Resources and authorization

```ts
type ResourceDeclaration =
  | { kind: "text"; title: string; access: Array<"read" | "write"> }
  | {
      kind: "directory"
      title: string
      include: string[]
      access: Array<"list" | "read" | "create" | "write" | "delete">
    }
  | { kind: "eidos"; title: string; access: Array<"read" | "write"> }
  | { kind: "output"; title: string; access: ["write"] }
interface GrantedResources {
  text(id: string): Promise<TextDocument>
  directory(id: string): Promise<TextDirectory>
  eidos(id: string): Promise<EidosResource>
  output(id: string): Promise<OutputDirectory>
}
```

Names resolve to user-selected resources, never hardcoded paths. Text, directory
and eidos bindings are within the active Space; output directories may be outside
it after explicit selection. Global installation retains separate bindings per
Space. Resource access is the intersection of declaration, user grant, instance
scope and host policy. Views/actions can access declared bound resources through
their lifetime, but cannot enumerate undeclared resources or capture handles for
another Space. No implicit broad filesystem permission exists.

Access lists are nonempty and unique. Text/eidos read is required; directory write
requires read, create/delete do not imply read. List never reveals excluded
names. A directory include glob is a root-relative slash-separated pattern of
literal segments, `*` within a segment and `**` as a whole segment; no negation,
brace expansion, character classes, absolute paths or `..`. `**/*.md` matches root
and nested Markdown files. Hosts restrict text operations to recognized ordinary
text files; `.eidos` is accessible through the eidos resource / data engine or the
restricted file-bound schema/configuration interface described above.

Directory API:

```ts
interface TextDirectory {
  list(options?: { cursor?: string; limit?: number }): Promise<{
    files: Array<{ path: string }>
    nextCursor?: string
  }>
  openText(path: string): Promise<TextDocument>
  createText(path: string, text: string): Promise<TextDocument>
  deleteText(path: string, expectedRevision: string): Promise<void>
  inspect(path: string): Promise<{ revision: string }>
}
```

Paths are relative to the bound root, never system paths. List pages default to
100 and cap at 1000; ordering is ordinal path order and cursors invalidate on
incompatible directory changes. createText persists only if absent and returns
its clean working copy; existing files return ALREADY_EXISTS. deleteText requires
explicit delete access, a revision from inspect, and refuses dirty/open working
copies (BUSY); it never silently discards work. It uses host recovery/history
where supported, without promising universal trash recovery. Parent creation
requires create permission and stays within the grant.
list requires list access; openText requires read; inspect requires read or
delete and reveals only the revision. A create-only grant returns a handle for
the new file that cannot be read or edited without the corresponding additional
rights. No creation operation implicitly expands the declared grant.

Traversal, absolute paths, symlinks/reparse points, protected implementation
paths and aliases to them MUST be rejected. Revalidate containment at access and
mutation, including parent traversal races; use host-native safe operations, not
just string prefix checks. Plugin source roots, installed packages, grant/config
stores and `.eidos` backing files cannot be modified through ordinary data grants.
Revoking/rebinding increments grant generation and invalidates old handles.

Relative Markdown assets use HostUI.resolveAsset(document, relativePath). The
host checks the requesting document grant plus explicit matching readable asset
bindings. It returns a revocable, lifetime-bound local URL for raster images,
SVG displayed as an image, or fonts with MIME/content checks. It never returns
raw paths or serves active HTML/scripts. Links use HostUI.openLink(document,
relativePath), which asks the host to navigate or request permission; it does
not give the caller read access. Direct network access requires declared network
capabilities as specified below.

### Device-local binary storage

The optional `storage: { maxBytes }` declaration grants device-local, plugin-private
binary object storage. `maxBytes` MUST be an integer from 1 through 1073741824.
The host MUST disclose this quota during installation review. View contexts expose
`storage.list(prefix?)`, `read(key)`, `write(key, Uint8Array)`, and `remove(key)`.
Reads return null for missing keys. Keys are opaque ASCII names of at most 100
characters (`A–Z`, `a–z`, digits, `.`, `_`, `/`, `@`, `-`), not filesystem paths.
Each object is limited to 4 MiB; a namespace has at most 25000 objects and the
declared aggregate byte quota. Writes MUST be atomic and quota checks serialized.
Access requires an active instance of the currently enabled plugin revision.
Namespaces are isolated by plugin ID, shared across Spaces on one device, and
persist across restarts and reinstallations. They are not Space Sync content.
Plugins MUST provide removal controls for large optional downloads.

### Bounded network requests

View contexts additionally expose `network.read({ url, range? })`, an anonymous
HTTPS GET returning `{ data: Uint8Array, status, etag? }`. The URL origin MUST
appear in `browser.networkOrigins`; credentials, redirects and undeclared headers
are forbidden. Optional ranges are `{ offset, length }` with safe integer values.
Responses are limited to 4 MiB and range responses MUST exactly honor the requested
range. The host limits request duration to 20 seconds and cancels on instance close.
The Lite transport pins the resolved IPv4 address, rejects loopback, RFC1918,
link-local and shared-address ranges, and retains TLS hostname verification.
The 198.18/15 benchmark range is supported for system TUN-proxy DNS routing.
This capability enables bounded downloads when a declared source does not support
opaque-origin CORS. It grants no ambient cookies, credentials, or filesystem access.

## 8. Text documents and editing

```ts
interface TextSnapshot {
  text: string
  version: string
  encoding: "utf-8" | "utf-16le" | "utf-16be"
  bom: boolean
  dirty: boolean
  conflicted: boolean
}
interface TextDocument {
  read(): Promise<TextSnapshot>
  observe(listener: (state: TextSnapshot) => void): Promise<{
    snapshot: TextSnapshot
    subscription: Disposable
  }>
  edit(change: {
    text: string
    expectedVersion: string
    label?: string
    group?: string
  }): Promise<{ status: "applied" | "stale"; snapshot: TextSnapshot }>
  save(): Promise<{ status: "saved" | "conflict"; snapshot: TextSnapshot }>
  undo(): Promise<TextSnapshot>
  redo(): Promise<TextSnapshot>
}
```

There is one host working copy per canonical file per Space session, shared with
built-in text editors. read/observe return it, not necessarily disk text. observe
atomically reads and subscribes: initial snapshot precedes subsequent ordered
notifications, with no read/subscribe gap. If delivery continuity breaks, fail
the subscription explicitly so clients resubscribe rather than silently miss
updates. Content versions are opaque and change on text edits, undo/redo and
reload; dirty/conflict changes also notify without necessarily changing version.

edit compares expectedVersion and modifies memory only. Stale returns current
state without writing. Successful acknowledgements enter host close/save handling;
there is no separate setDraft API. Plugins own parsing and protect unacknowledged
UI input. They serialize their edit requests, reconcile stale results explicitly
and MUST NOT blindly overwrite newer content. Full encoded text is limited to
2 MiB; binary/truncated/unsupported encodings fail. Preserve encoding and BOM.
No physical line/range or streaming contract is needed in 1.0.
read/observe require read authority; edit/save/undo/redo require write authority.
An exhausted undo/redo stack returns the unchanged snapshot. Undo/redo apply to
the host's latest state at dispatch and advance its version when text changes.

Undo/redo is per working copy and shared across views. Plugins MUST route document
undo/redo to the host and disable conflicting independent document history in
embedded editors; selection/scroll history may stay local. Each accepted edit is
one entry unless contiguous edits carry the same nonempty group from the same
view lifetime, arrive within two seconds and are separated by no foreign edit,
save, undo/redo or reload. Then they form one undo entry. Group strings are bounded
to 128 characters and never merge across lifetimes. Duplicate text is a no-op.
History retains at most 100 entries and 16 MiB of encoded history per document,
evicting oldest entries independently of current text and persisted-base state.

Saves serialize in the host and capture both working content and disk revision.
If saving V3 succeeds after an edit creates V4, advance the persisted base without
erasing V4; V4 remains dirty if different from persisted text. The response
contains current working-copy state. Externally changed disk content causes
conflict rather than unconditional replacement. Clean external updates reload;
dirty external updates preserve work and mark conflict. Host provides explicit
reload/discard and save-copy dialogs; plugins cannot silently discard content.
Writes reuse host atomic replacement/history/mutation rules, without claiming
OS-level compare-and-swap against uncooperative external writers.

Unloading or disabling plugins retains acknowledged working copies and offers a
built-in editor. Closing the last relevant document/Space/window uses host
save/discard/cancel. Acknowledgement is not durable crash recovery. Timeout,
revocation or disposal cannot undo an already committed write; inspect state
before retrying an uncertain operation.

### Document formatters

The optional manifest `formatters` array contains `{ id, title, extensions }`
declarations. IDs are unique within that array; selectors use the same extension
syntax and `.eidos` exclusion as document actions. Formatter-only plugins are
valid and require an `extension` entry. Activation registers each declared
formatter exactly once, before returning:

```ts
ctx.formatters.register("typography", {
  async format({ text, path, signal }) {
    return { text: await formatText(text, path, signal) }
  },
})
```

The provider receives only a text snapshot, its Space-relative path, and an
AbortSignal. It receives no TextDocument, resource handles, or editing/saving API.
Its result is `{ text: string }`. Host-owned invocation channels enforce this
restriction, including against direct guest RPC requests. Registration returns a
Disposable and participates in the extension lifetime. Timeout, disablement,
revocation and disposal cancel the invocation; late results cannot edit text.

The host pins the target and working-copy version before dispatch. On successful
completion it applies the output as one version-checked, undoable draft edit,
preserving encoding/BOM and the existing text size limit. Stale output fails
without replacing newer edits. Identical output creates no history entry and
does not mark the document dirty. Formatting does not save to disk.
Native-editor draft changes and navigation also invalidate pending formatter
invocations through a host-owned context version; plugin code cannot supply it.
Each invocation adopts the current workbench buffer, including native undo or
discard, rather than reusing a previously formatted plugin-side working copy.

The host owns Format Document, Format Document With, and Configure Default
Formatter commands. Only enabled matching providers are eligible. A single
provider runs automatically; multiple providers without a usable default prompt
for a choice. Defaults are isolated by Space and file extension and can be reset.
An unavailable saved default prompts rather than silently choosing a replacement.
Explicit choice runs once without changing the default. Format Document uses
Shift+Option+F on macOS, Shift+Alt+F on Windows and Ctrl+Shift+I on Linux by default,
and is configurable through host keyboard preferences. Providers do not reserve
their own format shortcut. Selection/range formatting and format-on-save are not
part of this contract.

## 9. Structured data and output

EidosResource exposes a capability-scoped Eidos File data engine client (`data`), not raw SQL or a parallel query language. The 1.0 allowlist is fixed:

| Grant                      | Data engine methods                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| read                       | inspect, listTables, getTable, listFields, listViews, getRow, queryRows, countRows, countRowsByField, aggregate |
| write (also requires read) | mutateRows, mutateSchema, createView, updateView, deleteView, reorderViews                                      |

These are the corresponding public Eidos File data engine methods for structured table and record manipulation. Arguments,
logical results, validation, required revision checks and errors are imported
from their data engine contract; RPC makes each method asynchronous. The generated
SDK MUST derive their types from the canonical data engine types and expose no other
methods. In particular there is no connection, raw SQL, file-close, checkpoint,
administrative mutation, or SQLite handle API. Data engine errors retain their code
and structured details in a distinct DataEngineError namespace; plugin transport
errors do not flatten them to IO_ERROR.

```ts
import type { EidosFileRuntime } from "@eidos.space/eidos-file"
type GrantedDataMethod =
  | "inspect"
  | "listTables"
  | "getTable"
  | "listFields"
  | "listViews"
  | "getRow"
  | "queryRows"
  | "countRows"
  | "countRowsByField"
  | "aggregate"
  | "mutateRows"
  | "mutateSchema"
  | "createView"
  | "updateView"
  | "deleteView"
  | "reorderViews"
type GrantedDataClient = {
  [K in GrantedDataMethod]: (
    ...args: Parameters<EidosFileRuntime[K]>
  ) => Promise<Awaited<ReturnType<EidosFileRuntime[K]>>>
}
interface EidosResource extends Disposable {
  readonly data: GrantedDataClient
}
interface TableContext {
  readonly tableId: string
  readonly viewId: string
  read(): Promise<{ fields: EidosFileFieldInfo[]; view: EidosFileViewInfo }>
  getPage(options: { offset: number; limit: number }): Promise<EidosFileRowPage>
  aggregate(options: TableAggregateOptions): Promise<TableAggregateResult>
  updateProperties(properties: Record<string, unknown>): Promise<void>
  openRecord(rowId: string): Promise<void>
  observe(listener: () => void): Disposable
}
```

EidosResource additionally exposes
`observeRevision(listener: (revision: string) => void): Promise<{ revision: string; subscription: Disposable }>`.
This atomically returns the current data revision and subscribes to subsequent
committed revisions, including changes from other editors. It is an invalidation
signal: clients requery through their granted data engine facade. Notifications may
coalesce to the newest revision, never imply a cross-file snapshot, and never
carry unrelated table contents. Failed delivery terminates explicitly, as for
text observations. This adapter notification does not change data engine semantics.

A TableContext is an adapter facade bound to one table and saved view. `read`
returns only its fields and view. `getPage` delegates to the existing data engine
data source with the host's active search, filter and sort query; guests supply
only a nonnegative safe-integer offset and a limit from 1 through 1,000.
Rows retain data engine projection semantics and field `tableColumnName` keys.
`updateProperties` replaces the bound view's `properties.plugin`, preserving
other properties, and requires a writable host. It permits configuration of
read-only record views, not record mutation. Its JSON payload is limited to
16,384 characters. `openRecord` validates membership before using host record
navigation. `observe` returns a disposable invalidation subscription; subscribe
before the initial read and requery on changes to host table/view/query state.
Notifications may coalesce and do not promise a multi-page snapshot.
The facade exposes no cross-table, row-mutation, schema or view-lifecycle API.
Enabled `table/view` contributions use the existing host view menu and persist
as `plugin:<plugin-id>/<view-id>`. Disabling or uninstalling a plugin retains
saved views and their configuration; unsupported types keep their normal fallback.
Full eidos resource access is broader only because the user granted
that named file. Structured mutations commit through the data engine immediately; they
are not text edits and have no TextDocument.save or invented text undo stack.
A multi-file page MUST NOT imply a cross-file transaction or atomic snapshot.

OutputDirectory has `begin()` returning an OutputBatch with
`write(path, bytes, mediaType)`, `commit()` and `dispose()`. Writes stage complete
artifacts in host storage, at most 16 MiB per artifact, 64 MiB/1000 artifacts per
batch. Relative paths obey containment rules; symlinks and protected paths fail.
Commit validates the complete plan before modifying destinations. New files may
be created; replacing existing files requires host overwrite confirmation and
revalidation against the captured destination revision. No undeclared deletion.
Commit returns an explicit per-file outcome and identifies partial failure;
1.0 does not promise atomic multi-file commits. Abandoned staging is removed on
disposal. A plugin cannot execute generated files or automatically install them.

```ts
interface OutputDirectory {
  begin(): Promise<OutputBatch>
}
interface OutputBatch extends Disposable {
  write(path: string, bytes: Uint8Array, mediaType: string): Promise<void>
  commit(): Promise<{
    status: "complete" | "partial" | "cancelled" | "failed"
    files: Array<
      | { path: string; status: "written" }
      | { path: string; status: "failed"; code: string; message: string }
      | { path: string; status: "skipped" }
    >
  }>
}
```

Duplicate staged paths fail with ALREADY_EXISTS; bytes are copied at dispatch.
commit is single-use and closes staging; a second commit/write fails with
INSTANCE_CLOSED. complete means every staged file was written; partial means
some but not all; cancelled means user cancellation before any destination write;
failed means no writes succeeded for another reason. Outcomes cover every staged
path. A disconnected/timed-out response can have an uncertain outcome and MUST
NOT be automatically retried. MIME metadata never grants permission to execute.

A personal-site action may read Markdown and authorized table data and write
HTML/CSS/assets to an output batch. Its page may provide a preview inside its
existing sandbox. Unrestricted local web servers, executing generated HTML with
plugin authority, network deployment, credentials and domains are out of scope.

## 10. Settings, host interaction and presentation

```ts
type SettingValue = boolean | string | number
type SettingDeclaration = { title: string; description?: string } & (
  | { type: "boolean"; default: boolean }
  | { type: "string"; default: string; enum?: string[] }
  | { type: "number"; default: number; minimum?: number; maximum?: number }
)
interface Settings {
  get(key: string): Promise<SettingValue>
  update(key: string, value: SettingValue): Promise<void>
  reset(key: string): Promise<void>
  observe(listener: (values: Record<string, SettingValue>) => void): Promise<{
    values: Record<string, SettingValue>
    subscription: Disposable
  }>
}
interface HostUI {
  notify(message: string): Promise<void>
  select(options: {
    title: string
    options: Array<{ id: string; label: string }>
  }): Promise<{ status: "selected"; id: string } | { status: "cancelled" }>
  confirm(options: {
    title: string
    message: string
  }): Promise<{ status: "confirmed" | "cancelled" }>
  navigate(viewId: string, route?: string): Promise<void>
  resolveAsset(document: TextDocument, relativePath: string): Promise<string>
  openLink(
    document: TextDocument,
    relativePath: string
  ): Promise<{ status: "opened" | "cancelled" }>
}
```

Setting declarations are flat keys with type boolean/string/number, title,
default, optional description, string enum, and numeric minimum/maximum. Defaults
and values MUST validate. Settings provides get(key), update(key,value),
reset(key), and observe(listener) with initial effective values plus a
Disposable subscription. Every operation implicitly targets the instance's Space
and plugin ID; effective order is Space value → manifest default. Only own declared
keys are accessible. Changes notify only instances in that Space whose effective
values change. Settings and grant records are local device state indexed by Space;
isolation does not require writing them into the Space folder. They are not secrets,
blob storage or executable grants. Incompatible stored values remain preserved,
fall back to validated defaults, and produce a visible diagnostic.
Settings keys follow local ID syntax; numbers must be finite, string values cap
at 4 KiB and total effective settings at 64 KiB. observe has the same atomic
initial-read/subscription guarantee as TextDocument.observe. select option IDs
are unique local IDs, options are nonempty and capped at 100.

### Table configuration

Table views may declare `configuration: { type: "object", properties: { ... } }`
for host-rendered View settings. Each property requires `title`, `type` and
`default`; supported types are boolean, string and number, with optional string
enum, numeric bounds and a string `"x-field": true` field selector. Schemas are
limited to 32 properties and 16,384 JSON characters. Unknown keywords and invalid
defaults are rejected. Values live in the view's `properties.plugin`;
`table.read()` supplies defaults and `table.observe()` invalidates readers.

Plugin-owned table configuration is separate from view properties. The host MUST
store it in `eidos__tables.settings_json` under `plugins[pluginId]`. The value
is an opaque JSON object owned by that plugin; the host does not interpret action
definitions, prompts or field mappings. A plugin may offer YAML import/export,
but a separate YAML file is not required. Credentials MUST NOT be stored here.

```ts
table.pluginConfig.read(): Promise<{ value: JsonObject | null; version: string }>
table.pluginConfig.write({ value, expectedVersion }): Promise<{ value: JsonObject | null; version: string }>
table.pluginConfig.observe(listener): Disposable
```

The host binds the table and plugin ID; guests cannot supply either. Missing
configuration reads as null; writing null removes only this plugin's namespace.
Writes require declared write access and a writable table. Values are limited to
64 KiB of canonical UTF-8 JSON. Invalid existing metadata MUST be preserved and
reported, never silently replaced. All other table settings and plugin namespaces
MUST survive a write.

The version is an opaque content token for this plugin's value, not a file
revision or a monotonic counter. A stale token MUST reject the write. The host
reads current settings at a pinned Runtime revision and commits through schema
preflight/mutation at that same revision. A concurrent file mutation may also
reject the write; callers must reread rather than blindly retry. Observation is
an invalidation hint, may include unrelated table changes, and does not deliver
an initial value; subscribe before reading. Multiple observers must coexist.

Lite table plugin views implement this config API. Table action extensions register
`ctx.actions.registerTableProvider(id, { getItems, run })` against declared table
actions placed at `table/context`. `getItems({table,signal})` returns at most 100
unique local IDs, plain titles and targets (`row`, `selection`, `view`). Listing
permits metadata/config reads only. Invocations receive a table-bound context;
config writes and observations are not exposed during an invocation.
Configuration belongs in a mounted table view.

The host freezes matching row IDs in the effective query order before execution,
including records not loaded by Grid. Grid range ends are exclusive. The toolbar
targets all filtered rows; a right-click inside a selection targets that selection.
Later inserts do not join a run. Capture rejects revision changes and more than
100,000 target IDs. `target.read({offset,limit,fields})` reads at most 100 records
and 64 fields, returning opaque per-run read tokens. Deleted records are omitted.
`target.update({readToken,values})` updates one existing row atomically, requires
declared write access, and accepts only fields declared by validated sample outputs.
Tokens bind current input/output values and field descriptors; changes reject the
result. Schema changes, new rows and row deletion are not exposed. Runtime type
validation remains authoritative. The host permits one write at a time.

`task.preview(rows)` is retained for compatibility as a sample/output-scope
declaration: Lite validates up to three samples with one common set of at most
16 output fields and returns true without a confirmation screen. Invoking an
action applies results directly. `task.report({completed,message})` reports
progress in a non-modal task card over the lower-right of the table. The card
shows the last supplied message separately and retains it through completion,
errors and undo/redo; starting a new run clears it. Messages are plain text,
bounded to 300 characters, and may contain plugin-calculated estimates.
The card
can be minimized or expanded. Close dismisses the window and its minimized chip;
progress and completion do not reopen it. A new invocation opens a new card.
Closing the window does not cancel execution. Cancel aborts network work and prevents further writes, while
retaining an already-dispatched atomic write and its undo receipt. Conditional
undo restores completed rows in reverse order and refuses to overwrite newer
edits. Reverting a receipt produces its inverse, enabling redo without rerunning
plugin logic or network requests. Redo uses the same conflict checks. Unchanged
results create no mutation or receipt. Undo and redo are unavailable during a run.
Undo receipts are session-local, capped at 64 MiB and released when the
table closes or the next run starts. Undo can stop on a conflict after restoring
other records; it is not an all-or-nothing transaction across the whole run.

Manifest `connections` declares up to eight named `{title,url}` HTTPS endpoints.
The host stores a Bearer key using OS encryption, scoped to Space, plugin,
connection and exact URL. Keys never enter plugin code, table JSON or packages.
`connections.request({connection,body})` sends JSON to that fixed endpoint only;
the host blocks redirects/private addresses, pins DNS, limits request/response
bodies to 1/4 MiB and times out after 25 seconds. Network requests exist only
during a live run and are cancelled when the instance closes. Lite permits up to
two in-flight requests per plugin instance across its connections; additional
requests are rejected as busy. Task cancellation aborts all pending requests for
that instance. This does not permit concurrent table writes. Hosts without
secure credential storage reject saving and use. Lite implements this execution
contract; other hosts must not advertise it until they implement the same rules.

Connections may declare `configurable: true`: Lite plugin Settings owns the full
HTTPS endpoint, model ID and encrypted key; the manifest URL is an initial
suggestion. Configuration remains Space/plugin/connection scoped, outside the
`.eidos` file. Changing endpoints requires a new key; changing only the model can
retain the existing key. The host overrides the request body's `model`, retains
size/concurrency/network restrictions, and uses a 90-second request timeout.
Eidos file views can use `file.connections.configured(id)` and
`file.connections.request({connection,body})` for declared configurable
connections only. They cannot read keys or change configuration. Access requires
a live instance with matching Space, owner and package revision; closing the
instance aborts its requests. Workspace settings instances can manage but not
call connections. Other hosts must reject unsupported capabilities.
Requests identify Lite with its own User-Agent. OpenCode Go endpoints additionally
receive a stable hash scoped to the connection and live instance in
`x-opencode-session`; raw instance tickets and keys are never used as session IDs.
Provider JSON error messages are bounded and credential-redacted before reaching
the plugin. Expected connection failures do not switch the editor to fallback UI.

Host-owned action templates and `pluginActions.instances` are not supported.
Smart Actions owns its action list, prompts, field mappings and TypeSafe model
integration; the host owns menu placement, task chrome and data authority.

HostUI provides asynchronous notify(message), select({title,options}),
confirm({title,message}), navigate(viewId,route), resolveAsset and openLink as
specified above. Text is plain, length-bounded to 4 KiB. Dialog cancellation is
an explicit cancelled result, not implicit approval. Calls cannot forge a host
permission prompt; authorization is a distinct host-owned UI. A host may rate
limit prompts. Views can render their own controls, but cannot mutate host chrome.

The mount/dispose contract is framework-neutral. A view MAY render React or
another browser UI framework inside its supplied root. Framework libraries MUST
be bundled as ordinary locked plugin dependencies; the host does not provide a
shared React instance. TSX uses the automatic JSX transform. The compiler MAY
resolve literal CommonJS require calls in locked dependencies at build time;
dynamic require and host/Node module access remain forbidden. Plugin disposal
MUST unmount framework roots and release document observations.

Dynamic table action items MAY include `icon: { paths: string[] }`, using the
same bounded monochrome 24×24 SVG path contract as manifest icons. Dynamic icons
MUST NOT reference files, remote images or executable markup. The host validates
icons before exposing menu items and aligns them with built-in menu icons.

Authenticated connection credentials are managed in the plugin's Settings tab,
not in the Grid toolbar. A live workspace extension may authorize host-owned
credential status/save operations; authenticated requests still require a live
table action instance. Credentials remain scoped to Space/plugin/connection/URL.

The host injects semantic CSS variables into each view: --eidos-background,
--eidos-foreground, --eidos-muted, --eidos-border, --eidos-accent,
--eidos-font-family and --eidos-color-scheme, plus --eidos-surface-hover and
--eidos-surface-selected for backgrounds. --eidos-muted is a secondary text color.
The container applies --eidos-color-scheme to the document root and styles all
scrollbars using --eidos-scrollbar-thumb, --eidos-scrollbar-thumb-hover and
--eidos-scrollbar-thumb-active, resolved from the shared host tokens. Tracks and
corners remain transparent. Native controls and scrollbars follow live theme updates.
Values derive from shared Eidos File
UI tokens through a safe value allowlist. Updates MUST NOT remount views or reset
focus/drafts. No theme service object is required. Native DOM events are local;
public host events are typed observations on their owning resource, not an
arbitrary global event bus.

## 11. Execution isolation and failures

Host-issued channels bind package revision, instance, contribution, Space,
resource handles and grant generation. Every request checks all applicable
bindings in a trusted host boundary. Guests cannot choose tickets or use an
asserted ID as authority. Only declared host APIs are exposed. CSP and the
resource loader deny undeclared remote connections, remote scripts, eval,
navigation, popups and plugin-created frames. Host creates isolated sibling
containers for views and extension logic; the sandbox bootstrap alone owns its
transport. Sandboxed iframe origins must not expose ambient same-origin host
storage or privileged document state.

The optional manifest member `browser` accepts `workers?: boolean` and
`networkOrigins?: string[]`. Origins must be unique exact HTTPS origins (at most
eight), without credentials, paths, wildcards or CSP delimiters. Installation
displays requested origins and worker capability. `workers: true` permits only
Blob workers from bundled code, never remote worker scripts. CSP permits
connections and images only to declared origins, plus local data/blob images.
Without these declarations network and workers remain blocked. Capability changes
require the same installation review as other manifest changes. Optional online
basemaps do not make package installation or offline fallback depend on a network.

Self-contained packages may embed WebAssembly bytes and instantiate them locally.
CSP permits `wasm-unsafe-eval` for this purpose, but not JavaScript `unsafe-eval`.
WASM imports obtain no extra host authority; network, native and filesystem
access remain unavailable except through existing granted APIs.

Host-owned timers close activation/mount attempts after 10 seconds and action
invocations after 30 seconds, revoke their scope and issue diagnostics. Maximum
64 pending RPCs per channel and 30-second individual request deadlines. Large
text/artifact payloads obey sections 8/9 limits; metadata requests cap at 256 KiB.
These are cooperative deadlines, not guarantees of preempting synchronous code
or containing crashes in a shared renderer. A host may use processes/workers
internally; browser workers do not expose Node or privileged host environments.

Stable codes: INVALID_REQUEST, UNSUPPORTED_API, PERMISSION_DENIED,
RESOURCE_UNBOUND, DOCUMENT_UNAVAILABLE, INSTANCE_CLOSED, STALE_REVISION,
ALREADY_EXISTS, BUSY, TOO_LARGE, IO_ERROR, TIMEOUT, CANCELLED,
REGISTRATION_CONFLICT, DEPENDENCY_MISSING, SOURCE_INVALID.
Messages aid humans; codes and typed edit/save conflicts are contractual.
Every observe/observeRevision API accepts an optional second callback
`onError: (error: { code: string; message: string }) => void`. A terminal delivery
failure calls it exactly once and disposes the subscription. Without that
callback the host surfaces a diagnostic on the affected contribution instead.
Normal manual disposal does not report an error.
Observer failures do not silently cancel other observers. Callback errors fail
the affected operation, not unrelated plugins. Diagnostics identify plugin,
revision, Space, contribution, phase and source location when available. Do not
record document bodies or secrets by default. Logs and plugin-rendered text are
untrusted data, including when consumed by an agent.

## 12. Authoring, agent access and revision acceptance

Authoring operations belong to trusted host tooling, not PluginContext. Plugins
MUST NOT install/rewrite themselves or other plugins through data grants.
An agent can author code through the user's existing coding authorization; this
does not automatically authorize the code to access data or execute.

CLI and agent interfaces MUST use the same authoring service and policy checks:

| CLI                                                            | Contract                                                                                     |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `eidos plugin create <directory> --template action\|view`      | Generate a minimal source plugin; default template is view                                   |
| `eidos plugin check <source>`                                  | Static metadata, references, dependency and full type diagnostics; never execute plugin code |
| `eidos plugin dev <source> --space <target>`                   | Attach an authorized source session; load and watch automatically                            |
| `eidos plugin inspect <session-id>`                            | Revision, declarations, grants, lifecycle and bounded diagnostics                            |
| `eidos plugin invoke <session-id> <action-id> --target <json>` | Invoke against an explicit target through normal context/permission checks                   |
| `eidos plugin accept <session-id> --revision <id>`             | Retain that exact successful candidate as the accepted local revision                        |
| `eidos plugin rollback <session-id> --revision <id>`           | Reactivate a retained revision after validating present grants                               |
| `eidos plugin pack <source> --out <file>`                      | Check and materialize an offline package; no activation                                      |

The table above is normative; the following output contract is part of it.
All commands support structured `--json`; dev streams versioned JSONL events to
stdout. Human diagnostics go to stderr. Events have schemaVersion:1, sessionId,
monotonic sequence, phase, revision when known, and structured diagnostics with
code/message/file/line/column when applicable. Phases are checking, transforming,
awaiting-authorization, activating, ready, failed, stopped and rolled-back.
CLI exit status is nonzero on terminal failure; a candidate error in an ongoing
watch session emits failed and retains the last good instance. Agent tools expose
the same operations; they do not parse terminal prose or rely on a second
privileged implementation.

Invocation targets are `{ kind: 'workspace' }`,
`{ kind: 'document', path: '<Space-relative path>' }`, or
`{ kind: 'table', path: '<Space-relative .eidos path>', tableId, viewId, rowId?: string, instanceId?: string }`.
The session pins the Space; paths identify requested targets, never grant access.
The host resolves canonical identity before dispatch. Interactive invocation may
omit --target and use a host picker; JSON/headless invocation requires it.
Missing authorization produces awaiting-authorization or a structured
PERMISSION_DENIED result; absence of interactive input never implies consent.

Source registration requires selecting Lite/Space and confirming the plugin's
requested authority through a host-owned flow. A platform-local authenticated
connection binds source identity, plugin ID, target Space and grant ceiling.
No unauthenticated reload endpoint or automatic discovery-and-execution of
arbitrary folders. Authoring inspect must reveal requested versus granted rights.

Revision states are draft source, validated candidate, running trial and accepted
revision. They are lifecycle states, not plugin kinds. Source-only changes within
an existing authorized identity/target/grant ceiling may reload without repeated
permission prompts. Increasing data scope/access, adding a privileged binding or
changing identity requires additional approval. Accept is a user decision or an
explicitly delegated authoring decision, not something plugin code can perform.

Candidates are immutable. Validate and stage before replacing the running
revision. Teardown aborts old action contexts without replaying their side effects.
After reload, host working copies and settings remain; cursor/scroll restoration
is best effort. If mount/activation fails, restore the last good revision if its
grants remain valid, otherwise use a built-in fallback. New declared actions must
pass activation validation before an action-bearing revision can be accepted.

Acceptance stores a self-contained local artifact so restart works offline even
if source/dependencies disappear. Retain the accepted artifact and the last good
trial for rollback; older revisions can be explicitly retained/pruned. A
permission revocation remains effective across rollback. Rollback affects code,
not documents, table data mutations, output files, settings or user authorization.
Cross-file effects and uncertain in-flight writes must remain visible.

No build command is required in the authoring loop. Agent-generated views follow
the same sandbox and grants as human-written ones. Success requires execution and visual
UI feedback as well as a passing compiler; check alone is not proof of behavior.

## 13. Reference scenarios and conformance tests

The following are required reference plugins, not new contribution categories:

| Scenario        | Contributions                         | Authority/data                                                    |
| --------------- | ------------------------------------- | ----------------------------------------------------------------- |
| CSV editor      | document view, optional format action | bound CSV working copy                                            |
| Markdown editor | document view                         | bound text, explicit attachment grants, host history              |
| Journals        | page view, optional new-entry action  | selected directory of Markdown, create/read/write                 |
| Personal site   | page view, optional generate action   | Markdown directory, read-only `.eidos`, optional output directory |
| Timeline        | table view                            | scoped table/saved-view context                                   |

Required acceptance cases:

- M01: equivalent JSON/inline descriptors normalize identically; computed metadata
  is rejected without execution; duplicate/unknown/mismatched declarations fail.
- S01: a single TS action loads without author-run build or separately installed
  Node; missing dependencies are diagnosed without downloads/scripts.
- S02: CSS/assets/locked local dependencies load offline; watcher catches reachable
  changes; inconsistent/failed candidates do not replace the working revision.
- P01: bounded decompression, duplicate keys, missing/extra entry modules, remote
  imports, traversal and integrity mismatches are rejected before execution.
- A01: shared installation with independent Space enablement, shared updates,
  uninstall/reinstall grant revocation, Space-only settings, explicit defaults and local
  resource selection never imply cross-Space or synced execution authority.
- A02: traversal, symlink/reparse races, protected paths, expired/rebound handles,
  forged IDs and cross-channel/cross-document requests are denied.
- V01: a pure view mounts without an extension; actions register transactionally;
  toolbar/palette/keybinding invocation has identical authority and pinned targets.
- D01: atomic observe, stale edits, simultaneous views, external clean/dirty edits,
  V3 save/V4 input, encoding/BOM preservation and 2 MiB boundaries.
- D02: host undo grouping, foreign-edit boundaries, history limits, close prompts,
  disable/reload with acknowledged drafts and uncertain writes.
- R01: create never overwrites, delete checks revision/dirty state, includes filter
  enumeration, relative assets require grants and links do not leak read access.
- E01: scoped data engine operations preserve engine errors/revisions/semantics;
  revision observation covers external commits; custom view metadata survives
  missing plugins and never triggers auto-install.
- O01: staged output, destination conflicts/overwrite confirmation, partial failure
  reporting, disposal cleanup, and generated code not auto-executed.
- U01: settings scope/reset/schema handling, cancellation, safe theme updates
  without remount and no unauthorized host DOM access.
- L01: failed activation cleanup, prompt/action deadlines, cancellation, idempotent
  teardown, diagnostics attribution and isolated operation failure.
- G01: agent create/check/dev/inspect/invoke/accept/rollback uses ordinary policy;
  existing grants survive source edits, increases request authorization, revoked
  grants do not return on rollback, code rollback does not roll back data.

Tests MUST exercise source and archive paths and actual sandbox enforcement,
not just mocks. The implementation should first establish the source loader and
view/action lifecycle, then working copies and grants, data engine/output integration,
and the complete authoring loop. Shipping conformity requires the full matrix.
Future compatible additions preserve these contracts; changes to public API
semantics require a new API major, not silent reinterpretation of version 1.

## Plugin compatibility contract

A manifest MAY declare `requires: { "pluginApi": "1.1.0" }`. The value MUST be a
stable three-component version with no leading zeros; components MUST be safe
JavaScript integers. This minimum is independent of npm SDK and product versions.
A host MUST reject a different API major or a requirement newer than its supported
contract, before installing, replacing, or executing a package. Failed compatibility
checks MUST leave an existing installation unchanged.

Hosts also derive required features from view contexts, extension/actions/formatters,
connections/resources/settings/storage and browser permissions. Authors do not
maintain a capabilities list. The shared host inventory is
`packages/plugin-runtime/src/compatibility-data.json`. This implementation advertises
Lite 1.6.0 and CLI Serve 1.0.0; those labels do not apply retroactively to old releases.
Contract 1.1.0 includes table action providers, table plugin configuration, tasks,
connections and eidos file views. CLI Serve implements table views only, plus its
declared browser permissions, and rejects unsupported contributions even if the
minimum API is satisfied. A contract revision alone does not imply all host surfaces.

Packages with a minimum requirement MUST use envelope format 2; format 2 MUST
contain a requirement. Format 1 MUST NOT contain one. Old Lite and CLI installers
reject format 2 rather than ignoring the new field. Historical CLI Serve loaders
did not validate the envelope: directly loading a package there is not protected
retroactively and requires upgrading the CLI. Legacy format 1 packages remain loadable when
inferred features are supported, but their minimum is reported as undeclared.
Manifest inference cannot prove compatibility of arbitrary dynamic calls. Authors
MUST raise the declared minimum when using newer APIs. Permission grants remain
separate from compatibility. This mechanism does not introduce date-based behavior.

`eidos plugin doctor [package]` reports the CLI contract and optional compatibility
result without installing or executing code. A successful diagnostic command can
report `compatible: false`; consumers MUST inspect that field. Lite's plugin details
show required and supported contract versions. Registry prose is not authoritative;
installation checks the downloaded package itself.
