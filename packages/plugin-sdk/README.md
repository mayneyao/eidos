# Eidos Plugin SDK

Type-only public API for [Eidos Plugins 1.0](../../docs/specs/eidos-lite-plugins-1.0.md).
The host injects capabilities when it mounts a view or activates an extension.
There is no runtime `connect()` and no host implementation to bundle.

A standalone Eidos Lite theme uses `kind: "theme"`, `requires.pluginApi:
"1.6.0"`, and a `theme` declaration with light/dark semantic tokens and optional
local fonts. It is a separate plugin type that styles the Lite host across all
Spaces. Theme plugins contain no modules, views, actions, or grants. Use the
`theme` starter from plugin-tools and pack it as a normal `.eidos-plugin`.

Lite Eidos file views can use `ctx.binding.file.connections.configured(id)` and
`request({ connection, body })` for manifest connections with `configurable: true`.
Users first save an HTTPS endpoint, model and encrypted API key in plugin Settings.
The host injects the configured model and Bearer key; plugins cannot read secrets
or choose a different endpoint per request. Closing the view cancels requests.

```ts
import type { ViewContext } from "@eidos.space/plugin-sdk"
export default async function mount(ctx: ViewContext, root: HTMLElement) {
  if (ctx.binding.kind !== "document") return
  const snapshot = await ctx.binding.document.read()
  root.textContent = snapshot.text
}
```

Use `document.edit({ text, expectedVersion })` to update the shared working copy;
`document.save()` persists it. A stale edit never overwrites newer content.
Resources and subscriptions belong to their contribution lifetime. SDK types
include the full target contract; hosts must report unavailable capabilities until
implemented and must not claim full conformance prematurely.

Formatting uses `manifest.formatters` and `ctx.formatters.register(id, provider)`.
Providers receive `{ text, path, signal }` and return `{ text }`, with no document
handle. The host owns formatter selection, per-Space defaults, the Format Document
shortcut, version checks and applying an undoable draft. General Actions remain
available for operations that do not fit a host-defined provider.

Run `pnpm --filter @eidos.space/plugin-sdk build` and `test` from the repository
root. Runtime validation, archives, compilation and sandbox bootstrap belong to
`packages/plugin-runtime`, not this package's public exports.

Table actions use `ctx.actions.registerTableProvider(id, { getItems, run })` and
a declared `table/context` placement. `getItems` can read table metadata and the
plugin's table configuration. `run` receives `TableActionContext`, a frozen target,
scoped read/update methods, preview/progress and declared credentialed connections.
It does not receive a raw Runtime or database handle. The host validates writes
against the read token and validates sample output scope before updating records.
Lite applies results directly and displays a minimizable task card. The legacy
`task.preview` call declares sample outputs without a confirmation screen.
Completed changes support conflict-checked undo/redo; redo replays saved values.

Edit configuration in a table view using `table.pluginConfig.read/write/observe`.
Values live in `settings_json.plugins[pluginId]`; optimistic writes preserve every
other namespace. Store credentials only in the host's encrypted connection form,
never in table settings. Declare fixed HTTPS endpoints through manifest
`connections: { id: { title, url } }`; plugin code never receives the Bearer key.
These capabilities require the new Lite host implementation; released Lite 0.16.0
does not implement them. See the specification for limits and cancellation/undo
semantics.

## Eidos file configuration views

A view with `context: "eidos"` can declare a `file/open` placement for
`extensions: [".eidos"]`. Its `ctx.binding.file` exposes `listTables()`,
`readTable(tableId)`, `readPluginConfig(tableId)` and
`writePluginConfig(tableId, { value, expectedVersion })`.
Writes require `access: "write"` and only modify this plugin's configuration
namespace in the chosen table. The host binds the file and plugin identity;
no filesystem handle, arbitrary runtime calls or row contents are exposed.
This requires the new Lite host; released Lite 0.16.0 does not support it.

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
