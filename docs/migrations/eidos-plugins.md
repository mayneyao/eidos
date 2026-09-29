# Updating Eidos Plugins

If your plugin uses context in View declarations or calls APIs through ctx.editor or ctx.table, follow these steps to update it.
Back up the source and package, adjust declarations and API paths, then verify it with existing settings and test files.

## 1. Preserve a baseline

Keep the old source, lockfile and archive. Work on a branch and test copies of
real data. Preserve package and contribution IDs so saved views, editor choices,
settings, credentials and private storage retain their identity. Increase the
plugin package version when distributing the migrated build. If the plugin's own
state schema changes, supply a separate migration and downgrade plan.

## 2. Change the manifest

All View declarations replace context with kind. Action context stays unchanged.

| Old View context | New kind | capabilities                           |
| ---------------- | -------- | -------------------------------------- |
| page             | page     | Omit                                   |
| document         | file     | ["document"]                           |
| eidos            | file     | ["eidos/schema", "eidos/config"]       |
| table            | file     | ["eidos/table"]                        |
| file or media    | file     | Omit; use filesystem/stream operations |

Eidos capabilities can be combined: eidos/schema for file structure, eidos/table
for the current table and eidos/config for plugin configuration. Declare only
the interfaces you use; document cannot be combined with Eidos capabilities. An ordinary
file view no longer gains document/Eidos access merely because of its extension;
declare the capability if the old plugin depended on that behavior.
Keep placements and IDs. table/view still exists and now targets a file view with
eidos/table. Navigation and plugin/settings target pages.

```json
{
  "apiVersion": 1,
  "id": "example.csv",
  "name": "CSV",
  "version": "0.2.0",
  "requires": { "pluginApi": "3.0.0" },
  "views": [
    {
      "id": "editor",
      "title": "CSV",
      "kind": "file",
      "capabilities": ["document"],
      "access": "write",
      "entry": "./src/main.ts"
    }
  ],
  "placements": [
    { "location": "file/open", "view": "editor", "extensions": [".csv"] }
  ]
}
```

Use requires.pluginApi 3.0.0 for executables, including CLI table views. Lite and
Serve share the major, but Serve still lacks actions, filesystem access and other
Lite-only features. Themes retain their data-only contract and CSS; do not convert
them to views. The old View context field is rejected rather than adapted.

## 3. Move operations to capabilities

| Old access                                       | New access                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| ctx.editor / ctx.binding.document                | ctx.capabilities.document                                           |
| ctx.table / ctx.binding.table                    | ctx.capabilities.eidos.table                                        |
| ctx.eidos / Eidos-view ctx.binding.file          | ctx.capabilities.eidos.schema / .config                             |
| ctx.file / media binding metadata                | ctx.binding.file                                                    |
| ctx.fs/ui/storage/network/settings               | ctx.capabilities.fs/ui/storage/network/settings                     |
| activate ctx.actions / ctx.formatters            | ctx.capabilities.actions / ctx.capabilities.formatters              |
| Table provider ctx.table/target/task/connections | ctx.capabilities.eidos.table + capabilities.target/task/connections |
| ctx.signal / ctx.subscriptions                   | Unchanged                                                           |

Do not mechanically replace all binding.file occurrences: old Eidos bindings
contained operations, whereas file/media bindings contained metadata.
File view binding.kind is always file. Inspect the required capability instead
of checking for document/table/eidos/media binding kinds. Table identity/location
is also available at binding.location. Action document bindings are file identity;
access the actual document under capabilities.

```ts
import type { Mount } from "@eidos.space/plugin-sdk"

const mount: Mount = async (ctx, root) => {
  if (!ctx.capabilities.document)
    throw new Error("Document capability required")
  const document = ctx.capabilities.document
  const observed = await document.observe((snapshot) => {
    if (!ctx.signal.aborted) root.textContent = snapshot.text
  })
  ctx.subscriptions.add(observed.subscription)
  if (!ctx.signal.aborted) root.textContent = observed.snapshot.text
}
export default mount
```

Document edit accepts `{ text, expectedVersion }`.
Keep edit serialization, stale/conflict handling, save, encoding, undo/redo and
recoverable drafts. Do not overwrite newer data or switch to fs.writeText.
Direct writes/delete/rename against an existing plugin-service working copy now
fail BUSY; use document.edit/save for text updates and surface the error for
delete/rename. Closing a view does not imply its cached working copy was released.

### Group Eidos operations by interface

If your plugin already uses capabilities, check these paths too:

Replace the manifest capability `table` with `eidos/table`; add `eidos/config` if you use configuration. Replace `eidos` with the `eidos/schema` and/or `eidos/config` members you use. Update imported interface types too: use `EidosCapabilities` for the namespace, `EidosSchema` for schema access and `EidosConfig` for configuration in place of `EidosFileContext` and `TablePluginConfig`. Configuration calls take an explicit tableId; the returned snapshot type is `EidosConfigSnapshot`.

| Previous call                                                   | Updated call                                           |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| capabilities.table                                              | capabilities.eidos.table                               |
| eidos.listTables() / eidos.readTable(id)                        | eidos.schema.listTables() / eidos.schema.readTable(id) |
| table.pluginConfig.read()                                       | eidos.config.read(table.tableId)                       |
| table.pluginConfig.write(input)                                 | eidos.config.write(table.tableId, input)               |
| table.pluginConfig.observe(listener)                            | eidos.config.watch(table.tableId, listener)            |
| eidos.readPluginConfig(id) / eidos.writePluginConfig(id, input) | eidos.config.read(id) / eidos.config.write(id, input)  |
| eidos.connections                                               | capabilities.connections                               |

Here, eidos means `ctx.capabilities.eidos`. Update read/write/watch arguments even when the configuration interface is stored in a local variable.
File views can select tables within the bound file; table views use only their current tableId, even with additional schema access.
Table action getItems and run receive eidos.table and read-only eidos.config; target, task and connections keep their locations.

```ts
const { table, config } = ctx.capabilities.eidos ?? {}
if (!table || !config) throw new Error("Table and config capabilities required")
const current = await config.read(table.tableId)
await config.write(table.tableId, {
  value: { ...current.value, compact: true },
  expectedVersion: current.version,
})
```

This view requires eidos/table, eidos/config and access: write.
Configuration remains in the same table and plugin namespace; no data transfer or settings reset is needed.

## 4. Check host-specific methods

Shared service members are optional when a host omits them. Views have
settings.get only; actions in Lite also have set/reset. settings.observe and
ui.select/confirm are no longer exposed as unsupported placeholders.
ui.openFile/navigate and eidos.config are optional. Narrow before use;
provide a fallback or explicitly reject an unsupported host. Implement selection or confirmation interactions within your plugin when needed.

```ts
ctx.subscriptions.add(
  ctx.capabilities.actions.register("open", async (action) => {
    const { ui } = action.capabilities
    if (!ui.navigate) throw new Error("This action requires page navigation")
    await ui.navigate("main", "/")
  })
)
```

For table providers change destructuring as well:
`getItems({ capabilities: { eidos: { table, config } }, signal })`. Existing run pagination,
readToken, task.report and undo semantics remain unchanged.
Cancellation retains completed changes; show users which records completed and which remain.

## 5. Review authority and stored state

Workspace action context no longer implies workspace file access. Declare
workspace.files when it is actually needed. Writable pages also need explicit
access: write. A read-only contribution cannot inherit package workspace write
permission. File views remain confined to the bound file and its allowed directory scope.

Preserve Space enablement, settings/connection IDs, table pluginConfig namespaces,
view properties, field IDs and private storage keys. Keep optimistic config
versions and unknown fields. Credentials stay in the host; do not export them
into migration fixtures. Existing model connection behavior remains unchanged.
An API-path migration alone does not require a state schema change. Do not change
the plugin ID to bypass migration checks: that would create a different identity.

## 6. Build and verify

Update your project's SDK and development tools, confirm that they support the API declared in the manifest, and commit the updated lockfile. Run from the plugin directory:

```sh
npx @eidos.space/plugin-tools check . --target lite
npx @eidos.space/plugin-tools pack .
```

If you also support CLI Serve, run check . --target cli, then inspect the package with `eidos --json plugin doctor /absolute/plugin.eidos-plugin` and confirm compatible is true.

Search for old access, then inspect aliases/destructuring manually:

```sh
rg -n 'ctx\.(editor|table|eidos|file|fs|ui|network|storage|settings|actions|formatters)\b|binding\.(document|table|media)\b' src
rg -n 'capabilities\.table|pluginConfig|readPluginConfig|writePluginConfig|eidos\.(listTables|readTable|connections)' src
rg -n '"context"|"requires"|"capabilities"' plugin.json
```

Action context matches are expected; old View context matches are not.

| Acceptance case    | Required outcome                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Each placement     | Same contribution ID and resource; only page/file View binding                                                            |
| Text editor        | Save/reopen, undo/redo, stale edit, external conflict and dirty draft preserve content                                    |
| File/media         | Stream and disposal work; undeclared document/Eidos operations are absent                                                 |
| Table view/action  | Query and config scope preserved; pagination, derived-field rejection, stale tokens, cancellation and partial undo tested |
| Authorization      | Workspace action without files grant denied; read-only contribution cannot write even under package grant                 |
| State upgrade      | Old settings, config, associations and private data survive; credentials never leave the host                             |
| Lifecycle          | Remount does not leak observers or rerun completed mutations                                                              |
| Host compatibility | Every advertised host tested; old incompatible package remains manageable and is not silently executed                    |

After verification, increase the plugin version and distribute the new package. Record dependency versions, tested environments and rollback instructions, and keep the previous archive. Rolling back code leaves completed data writes in place; schema changes need a corresponding data recovery plan.

## API naming migration

| Previous API                                  | Current API                       |
| --------------------------------------------- | --------------------------------- |
| table.read()                                  | table.readContext()               |
| table.getPage(options)                        | table.readRows(options)           |
| table.updateProperties(value)                 | table.setViewConfig(value)        |
| table.observe(listener)                       | table.watch(listener)             |
| config.observe(tableId, listener)             | config.watch(tableId, listener)   |
| target.read(options)                          | target.readRows(options)          |
| task.preview(samples)                         | task.declareOutputs(samples)      |
| connections.configured(id)                    | connections.isConfigured(id)      |
| settings.update(key, value)                   | settings.set(key, value)          |
| storage.remove(key)                           | storage.delete(key)               |
| FileContext                                   | FileMetadata                      |
| TableContext / TableViewSnapshot              | EidosTable / EidosTableSnapshot   |
| EidosPluginConfig / TablePluginConfigSnapshot | EidosConfig / EidosConfigSnapshot |
| Settings                                      | PluginSettings                    |

`declareOutputs` returns `Promise<void>`. Replace boolean-result branches with `await task.declareOutputs(samples)`; invalid samples reject. `setViewConfig` replaces the current view's plugin configuration: merge fields that must be retained before calling it. `watch` sends invalidation notifications only; `document.observe` supplies an initial snapshot and subsequent updates.

Remove manifest `resources` and action `configuration` and `multiple`. Remove imports of `ResourceDeclaration`, `ActionConfiguration`, `ActionConfigProperty`, `TableActionInstance`, `GrantedDataMethod`, `GrantedDataClient`, `GrantedRuntimeMethod`, `GrantedRuntimeClient` and `EidosResource`. Ordinary action bindings are workspace/file; table operations use provider contexts. Ordinary actions have no `capabilities.eidos`, and `settings.observe` is unavailable. Previous names have no aliases.
