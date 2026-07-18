# Eidos File developer site

This is the registry-consumer documentation and playground for Eidos File
`0.1.0`. It is a standalone Vinext/Cloudflare Sites application, not a workspace
package.

The site covers five public journeys:

- Quickstart: install and render a minimal host;
- Build a View: implement the typed Timeline renderer used by the live demo;
- Embed: own adapters, permission, save, conflict, and recovery UI;
- API / Contracts: inspect package boundaries and lifecycle states;
- Playground: open a real 2,500-row `.eidos` file with SQLite WASM.

Both Eidos packages are pinned exactly. `verify:registry` rejects workspace,
link, file, and monorepo resolution. The release workflow builds once against
candidate tarballs in an external directory, then again from the exact public
registry versions before deployment.

```bash
pnpm install --frozen-lockfile
pnpm verify:registry
pnpm typecheck
pnpm lint
pnpm test
```

The sample and any file selected by a visitor remain in the browser. The demo
adapter is in-memory so failure and compare-and-swap conflict states can be
repeated without writing to a visitor's filesystem.
