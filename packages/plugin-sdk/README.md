# Eidos Plugin SDK

Type-only public API for [Eidos Plugins 1.0](../../docs/specs/eidos-lite-plugins-1.0.md).
The host injects capabilities when it mounts a view or activates an extension.
There is no runtime `connect()` and no host implementation to bundle.

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
