# Eidos Plugin SDK

Type-only API for the [Plugin API 3.0 source contract](../../docs/specs/eidos-lite-plugins-1.0.md).
Import with `import type`; the host injects operations. There is no runtime SDK
connection. This source revision requires matching SDK, tools and host builds;
no published release is implied.

Views have `kind: "page" | "file"`. File views declare `document` for text, or combine
`eidos/schema`, `eidos/table` and `eidos/config` for Eidos data. Bindings contain metadata only; operations
live under `ctx.capabilities`. Shared services are optional when host support differs.

```ts
import type { Mount } from "@eidos.space/plugin-sdk"
const mount: Mount = async (ctx, root) => {
  const document = ctx.capabilities.document
  if (!document) throw new Error("Document capability required")
  root.textContent = (await document.read()).text
}
export default mount
```

Executable source-tree profiles require API 3.0.0. Lite supports page/file views,
extensions, scoped filesystem, settings, private storage, network and connections.
Serve supports file views with `eidos/table` and notification UI. Check the
actual target with plugin-tools; do not assume feature parity. Themes retain
their independent data-only API 1.6.0 compatibility.

Use document edit/save/undo/redo for text working copies. Direct filesystem
mutation must not bypass an existing plugin-service working copy. Workspace file
access requires explicit workspace.files and writes require contribution access.

Extensions retain activate and register through capabilities.actions/formatters.
Table providers retain getItems/run with eidos.table/eidos.config/target/task/connections under
capabilities; task.declareOutputs validates output samples and establishes writable fields.
Eidos config read/write/watch use an explicit tableId and remain scoped to the
bound file (or current table) and plugin namespace. Connections are a common
capability and keep credentials in the host.

Method names describe their behavior: `read` returns data, `list` enumerates,
`set` replaces a value, `update` applies a partial change, and `delete` removes
an entry. `watch` sends invalidation notifications; `document.observe` also
returns an initial snapshot. Boolean queries use `is`, as in `isConfigured`.
`eidos.config.write` uses an expected version to protect replacement from conflicts.
`table.setViewConfig` replaces the saved view's plugin configuration; merge keys
that must be retained before calling it.

See the bilingual [migration guide](../../docs/migrations/eidos-plugins.md)
([中文](../../docs/migrations/eidos-plugins.zh.md)) and
[API reference](../../apps/docs/src/content/docs/plugins/api.mdx).
Build with `pnpm --filter @eidos.space/plugin-sdk build` and run `test` from the root.
Runtime validation and sandboxing belong to plugin-runtime, not this package.
