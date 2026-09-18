# Plugin runtime implementation

Private, host-side implementation of the [Eidos Plugins 1.0 target specification](../../docs/specs/eidos-lite-plugins-1.0.md).
This package does not claim complete Plugin 1.0 conformance.

Implemented modules:

- `contracts`: type-only re-exports of the public SDK contract.
- `manifest`: strict declaration, placement, resource and setting validation.
- `compiler`: static inline descriptors, type checking, entry signature checking,
  fixed browser ESM compilation, local dependency identity checks, and revision
  snapshots. It never executes plugin code, build configuration or install scripts.
- `package`: bounded gzip/UTF-8 JSON envelopes, duplicate-key rejection, exact
  module coverage, JavaScript validation and rejection of external module imports.
- `working-copy`: host-owned text state, versioned edits, shared undo/redo,
  serialized saves, conflict handling, scoped handles and bounded observations.
- `lifecycle`: disposal scopes and transactional action registration.
- `sandbox` and `rpc`: restricted document-view bootstrap, injected SDK handles,
  bounded host messages, and working-copy observation delivery.
- `revisions`: serialized trial/accept/rollback operations, source watching and
  content-addressed artifact storage. Authorization, isolated activation and the
  accepted-revision pointer are supplied by the trusted host.

Run from the repository root:

```sh
pnpm --filter @eidos.space/plugin-runtime test
pnpm --filter @eidos.space/plugin-runtime typecheck
```

The compiler accepts a source directory containing `plugin.json`, or a single
TS/JS file exporting a static `manifest`. Dependency-free plugins need no project
installation. Dependencies require an existing npm v2/v3 or pnpm v9 lockfile and
matching installed package identities; installation is never performed here.
Installed dependency bytes are captured in the source revision. These checks do
not authenticate a publisher or claim an npm tarball integrity verification.

This is a library boundary, not a sandbox. `RevisionHost.activate` must create a
restricted guest container. Do not implement it with a host-side dynamic import,
jiti, eval or Node VM. Pass only authorized data capabilities through the guest
bridge. Document backends must enforce canonical paths, encoding, disk revisions,
safe writes and history. `WorkingCopyRegistry` keys must be canonical identities
supplied by the host, never guest-controlled paths.

The public SDK is now type-only. Lite document/page views, lazy workspace/document
actions and Rust CLI check/pack
consume this runtime. Lite loads source directly, keeps automatic source updates
ephemeral, and retains the installed revision across restarts. The CSV browser
smoke exercises compiled code, editing, saving and isolation in real Chromium:

```sh
pnpm --filter @eidos.space/plugin-runtime build
node packages/plugin-runtime/scripts/browser-smoke.mjs
node scripts/run-electron-node.mjs packages/plugin-runtime/scripts/extension-browser-smoke.mjs
```

After packaging Lite, verify its compiler assets with Electron's Node mode:

```sh
node scripts/run-electron-node.mjs apps/eidos-lite-desktop/scripts/plugin-compiler-packaged-smoke.mjs "/absolute/path/to/Contents/Resources/app.asar"
```

The packager normally excludes `.d.ts` files. Lite retains the type-only SDK
as `contracts.ts` and explicitly copies TypeScript standard libraries into the
unpacked compiler directory. Native esbuild and TypeScript resolve there at runtime.

Remaining integration includes a complete shared working-copy model with built-in
editors, resource grants, table views/actions, settings/Runtime/output
adapters, authoring IPC and standalone CLI compiler distribution. Lite currently
rejects unsupported manifest capabilities at installation. The old HTML prototype
envelope is deliberately rejected; no compatibility adapter is provided.
