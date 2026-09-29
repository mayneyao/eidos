# Develop Eidos plugins

Use this workflow to deliver working plugin source and a checked, installable
`.eidos-plugin` archive. For source-only or debugging requests, keep the
deliverable within the requested scope. This is the Eidos host plugin system,
not Codex plugins or retired Eidos extension packages.

## 1. Choose the host and extension point

This checkout implements API 3.0.0: page/file views, metadata-only `ctx.binding`,
and operations under `ctx.capabilities`. For existing plugins read the
[migration guide](https://github.com/mayneyao/eidos/blob/main/docs/migrations/eidos-plugins.md)
([中文](https://github.com/mayneyao/eidos/blob/main/docs/migrations/eidos-plugins.zh.md)); in a checkout read
`docs/migrations/eidos-plugins.md` directly. Verify the actual
host, SDK and tool contract. Source availability is not a published release:
use checkout builds for API 3 until matching releases are available. Preserve
plugin identity, stored state and access declarations. Do not mix API 2 types
with API 3 templates or lower requirements to bypass incompatibility.

Infer the host and desired user interaction from the request and existing
project. Ask only when the choice changes the implementation. For a new project,
use the user's destination or a separate plugin directory; do not add ordinary
user plugins to the Eidos product source tree.

Source-tree contracts (SDK/tools 0.5.0; verify release availability):

| User interaction                                      | Starter         | Host and contract               |
| ----------------------------------------------------- | --------------- | ------------------------------- |
| Edit a text file with host save and undo/redo         | `document-view` | Lite, API `3.0.0`               |
| Inspect tables/schema in an `.eidos` file             | `eidos-view`    | Lite, API `3.0.0`               |
| Visualize records inside a table                      | `table-view`    | Lite and CLI Serve, API `3.0.0` |
| Change selected or filtered table records             | `table-action`  | Lite, API `3.0.0`               |
| Open an independent page from navigation or a command | `page`          | Lite, API `3.0.0`               |
| Change the host's light/dark appearance               | `theme`         | Lite, data-only API `1.6.0`     |

Generic file views (including media), custom commands, and formatters can use the installed SDK's
declarations even when no dedicated starter exists. Do not invent template names.
Lite and CLI Serve do not have feature parity. A Lite plugin need not pass the
CLI profile; a request for both hosts requires checking both profiles and may
require separate manifests/packages. Do not lower an API requirement merely to
silence a compatibility error.

## 2. Establish the toolchain and scaffold

Check Node.js (`node --version`); authoring tools require Node >=22.12.
Reuse the project's package manager, lockfile, and installed tool version.
For a new project:

```sh
npx @eidos.space/plugin-tools --help
npx @eidos.space/plugin-tools templates --json
npx @eidos.space/plugin-tools create my-plugin --template document-view --json
cd my-plugin
npm install
npm run check -- --target lite --json
```

Choose the actual starter before running `create`; the destination must not
already exist and its basename must use lowercase letters, digits, and hyphens,
starting with a letter. Preserve an existing project's source and identity.
Third-party dependencies need a matching lockfile and local installation; keep
SDK and tools versions compatible with the chosen host. Add React explicitly if
needed; there is no `--react` creation flag in this tool version.

When working against an Eidos checkout, use its built tool via
`node packages/plugin-tools/bin/eidos-plugin.mjs` from the repository root in
place of `npx @eidos.space/plugin-tools`. Build the packages according to
`packages/plugin-tools/README.md` if its compiler is missing or stale. A released
npm tool may lag the checkout: inspect `templates`, help, and installed types
instead of assuming the newest source contract is already published.

Do not use `eidos plugin create/check/pack`: CLI 2.0 rejects the old authoring
commands. `eidos-plugin dev` is also not implemented. Development loading is
through Lite. `eidos plugin doctor <package>` checks the installed CLI host;
it is not a Lite runtime test.

For a small dependency-free plugin, a standalone `.ts` or `.js` file is valid:
export a named `manifest` and the default `mount` or `activate` function.
Check and pack accept that file path, and Lite can load it directly. Prefer a
scaffold for multiple entry points, dependencies, tests, or substantial UI.

## 3. Implement against the matching SDK

Read the generated source and installed `@eidos.space/plugin-sdk` types before
writing API calls. In the Eidos checkout, authoritative implementation references
are `packages/plugin-sdk/src/index.ts` and `packages/plugin-tools/templates/`.
The public [guide](https://docs.eidos.space/plugins/guide/),
[workflow](https://docs.eidos.space/plugins/workflow/), and
[API reference](https://docs.eidos.space/plugins/api/) provide background, but
older examples may use `file-view`, obsolete CLI authoring commands, or API 1.x
helpers. Prefer the matching types, generated starter, and target check when
they disagree; do not copy legacy APIs into a new Lite plugin.

Manifest and lifecycle rules:

- Keep `apiVersion: 1`; `requires.pluginApi` selects the host contract, not the
  npm SDK version. Source-tree executable plugins require `3.0.0`.
- Declare entry points, views/actions/formatters, and placements with matching
  IDs. A view declaration alone does not specify where the user opens it.
- SDK imports are type-only. Views default-export `mount(ctx, root)`; extensions
  default-export `activate(ctx)`. Capabilities arrive through the host context,
  not runtime SDK imports, Electron, Node filesystem APIs, or direct SQLite.
- Declare only `kind: "page" | "file"` for views. A file view declares document for text, or combines
  eidos/schema, eidos/table and eidos/config for Eidos data. A page cannot require
  bound-data capabilities. Never mix document with Eidos capabilities.
  Action `context` remains an invocation condition, not another View kind.
- Use `ctx.binding` for file/location/route metadata, and `ctx.capabilities` for
  operations. Narrow optional capabilities before use. Serve provides eidos.table and
  notify, not Lite filesystem/storage/settings/navigation/eidos.config services.
  Extensions register via `ctx.capabilities.actions` and `.formatters`;
  filesystem and UI calls belong to the supplied action/view context.
- Add observers and registrations to `ctx.subscriptions`; use `ctx.signal` for
  cancellation. Dispose React roots, listeners, and other resources on unmount.
  Ignore outdated async results after disposal or a newer request.
- Declare only needed access. Cross-file access in a Space uses
  `workspace.files` and `ctx.capabilities.fs`; network access uses the declared browser
  origins/connections and the matching host APIs. Do not assume unrestricted
  filesystem or network access. Workspace action context grants no implicit file
  access; writes also need contribution `access: "write"`. Direct fs mutations
  of an existing plugin-service working copy fail BUSY. Use `ctx.capabilities.ui.openFile` for host file navigation.
- Render loading, empty, and error states. Use the starter's injected semantic
  theme variables and show untrusted file/row text as text, not raw HTML.

### Text document editors

Use the `document-view` starter and `ctx.capabilities.document`. Observe the initial
snapshot and subsequent changes; edit with the current `expectedVersion`;
serialize edits; use host `save`, `undo`, and `redo`. An edit can return `stale`,
and save can return `conflict`: preserve the draft and surface reconciliation,
not unconditional retry or filesystem overwrite. Preserve the format's newline,
encoding/BOM, and round-trip behavior. `ctx.capabilities.fs.writeText` is not a substitute for
the host's document editing and save lifecycle.

### Eidos views and table actions

Use the bound Eidos/table interfaces and granted data methods, not raw database
writes or a plugin-owned reimplementation of Eidos semantics. Resolve field IDs
from schema rather than hardcoding display names. Do not write derived fields.
Observe table invalidation and refresh the view. When updating plugin config,
read its version and supply `expectedVersion`.

Use `ctx.capabilities.eidos.schema` for listTables/readTable, `.table` for the
current table, and `.config` for read(tableId), write(tableId, input), and
watch(tableId, listener). Declare each required eidos/... capability separately.
Config is scoped to this plugin; a table binding restricts it to the bound table,
even with schema access. Subscribe and read initially, then reread on invalidation.
Use `ctx.capabilities.connections` for declared credentialed requests, independently
of Eidos data. Ordinary action connections expire with the invocation.

For dynamic actions, adapt the `table-action` starter. Its eidos/target/task/connections
are under `ctx.capabilities`; getItems receives eidos.table, read-only eidos.config and signal:

- Register a `TableActionProvider` for the declared action ID.
- Recheck field writability when the action runs.
- Respect the host-frozen `ctx.capabilities.target`; paginate all `target.count` records,
  rather than operating only on the first page or rebuilding row selections.
- Before writes, call `task.declareOutputs` with an actual output sample containing a
  `readToken` and proposed `values`.
  Await validation before writing; invalid samples reject the call.
- Update using each returned `readToken`, honor cancellation between writes,
  and report progress. Let Lite own task undo/redo. On conflicts, surface the
  failure instead of rereading and silently overwriting newer data.

### Themes

Use `kind: "theme"` with a stylesheet and no executable contributions. Define
both light and dark palettes using the theme starter's host variables. Themes
are applied globally in Plugin Manager rather than enabled per Space. CLI Serve
does not support themes; verify in Lite, including readable contrast and focus.

## 4. Validate and exercise the actual interaction

```sh
npm run check -- --target lite --json
# For a CLI Serve plugin, use --target cli instead.
```

Always select the intended target. Without `--target`, check can report an
incompatible host without failing. A successful check proves compilation/types,
manifest validity, and the tool's compatibility profile, not runtime behavior.

Add focused behavioral tests where the plugin's logic warrants them: parsers
should round-trip representative and malformed files; table actions should
cover pagination, cancellation, stale writes, and derived fields. The
`table-action` starter includes a runnable `npm test`; other starters need
tests appropriate to their behavior, not an assumed test script.

In Lite, open a test Space, choose **Plugins → Load development source**, and
select `plugin.json` (or the standalone source). Review the declared access and
enable the executable plugin for that Space. Exercise the actual entry point:
Open with, table view, context menu, navigation, or command palette. Verify the
requested behavior, error handling, light/dark rendering, and disposal/remount;
for editors verify save/reopen, undo/redo, and an external change conflict.
Use disposable fixture data for mutating tests.

Source changes recompile and remount automatically. Invalid code retains the
previous view, so a still-visible UI does not prove the new source works. Inspect
the error banner. Declaration changes require renewed review; hot reload is
ephemeral, and restart returns to the installed revision. A mount rollback does
not undo data changes. Package and install the final version for durable use.

When testing the Eidos repository's development app, follow its `AGENTS.md`:
launch only `pnpm dev:eidos-lite`, verify the port 5179 listener belongs to the
checkout and the document URL starts `http://localhost:5179/`, and select the
exact checkout's Electron.app path. Never use a generic Electron lookup or the
installed Lite app as proof for checkout changes.

For CLI Serve, check `--target cli`, pack, run
`eidos --json plugin doctor /absolute/path/to/plugin.eidos-plugin`, and load it
with `eidos serve /absolute/path/to/test.eidos --plugin /absolute/path/to/plugin.eidos-plugin`.
Exercise the table view in the served editor. If the target host cannot be run,
finish source checks and packaging, and clearly mark runtime validation as
unverified rather than claiming completion of that check.

## 5. Package and hand off

```sh
npm run pack:plugin -- --json
```

Use the returned output paths: pack emits a self-contained `.eidos-plugin` and
adjacent `.sha256` file, normally under `dist/`. Dependencies are bundled;
installed bundled code does not need Node or the author's development server.
Check the intended host before packing; pack has no `--target` option.

Deliver the source location, archive and checksum, host/API requirement, load
instructions, tests actually run, and any remaining limitation. For an
installation request, use Plugin Manager or
`eidos --json plugin install /absolute/path/to/plugin.eidos-plugin`; then verify
the installed revision in the target host. Installation is device-wide while
executable enablement is per Space. Do not uninstall shared plugins as cleanup.

Building a plugin does not itself request public release. If publishing is
requested, the tool's `registry --help` describes a local registry-draft helper;
generating a draft does not upload a release or submit it to a registry.
