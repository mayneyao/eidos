# Plugin tools maintenance

Read the public [development guide](../../apps/docs/src/content/docs/plugins/guide.mdx)
([中文](../../apps/docs/src/content/docs/zh-cn/plugins/guide.mdx)) for the installed
workflow. This document is for repository maintainers.

Rust owns the `eidos plugin` entry point. This package supplies the compiler backend
and CSV scaffold. SDK imports are types only; runtime capabilities are injected
through `mount(ctx, root)`. Check and pack accept directories containing `plugin.json`
or standalone TS/JS sources, without executing plugin code or build configuration.

## Checkout setup

```sh
pnpm install
pnpm --filter @eidos.space/plugin-sdk build
pnpm --filter @eidos.space/plugin-runtime build
cd apps/cli
cargo build --locked
cd ../..
export EIDOS_PLUGIN_TOOLS="$PWD/packages/plugin-tools/bin/eidos-plugin.mjs"
apps/cli/target/debug/eidos plugin create /tmp/my-csv-editor
apps/cli/target/debug/eidos plugin check /tmp/my-csv-editor
apps/cli/target/debug/eidos plugin pack /tmp/my-csv-editor --out /tmp/my-csv-editor.eidos-plugin
EIDOS_PLUGIN_CLI="$PWD/apps/cli/target/debug/eidos" pnpm --filter @eidos.space/plugin-tools test
```

The bridge requires Node.js >=22.12. `@eidos.space/plugin-tools` bundles its
compiler backend into `dist/compiler.js` via `build.mjs` and is published to npm
alongside `@eidos.space/plugin-sdk`. Developers can use `npx @eidos.space/plugin-tools create`
or the Rust `eidos plugin` CLI interchangeably. Dependency-free compilation uses
the built-in SDK types; third-party dependencies require a matching lockfile and local install.

## Lite development

Start Lite with `pnpm dev:eidos-lite` from the root. Set
`EIDOS_LITE_DEV_USER_DATA=/absolute/test/profile` for an isolated profile.
Open a folder containing a CSV and load `plugin.json` or a TS/JS file with
**Load development source**. Review access and scope, then select CSV Table in
**Open with**. Installation is device-wide; enablement and default editor
associations are independent per Space. Updating the shared version preserves
Space enablement, and uninstalling affects every Space.

Lite recompiles and remounts on source changes. Invalid code keeps the previous
view; declaration changes require review. Automatic updates remain ephemeral;
restart returns to the installed revision. Package and install to retain a revision.
A mount timeout restores previous code without undoing data. CLI dev/inspect/invoke/
accept/rollback are not implemented; dev reports this explicitly.

## Package and example

Pack creates bounded gzip JSON `{format: 1, manifest, modules}` with self-contained
browser modules. The old HTML envelope is rejected. Installed plugins need neither
Node nor a network connection. Lite accepts document/page views and workspace/document
actions without named resources or settings, and rejects unsupported data capabilities.
The independent `eidos-text-tools-plugin` project in `~/workspace/eidos-plugins` demonstrates a navigation page,
opaque routes and lazily activated commands. The extension browser smoke exercises
the real Lite service with Chromium under Electron's Node mode:

```sh
node scripts/run-electron-node.mjs packages/plugin-runtime/scripts/extension-browser-smoke.mjs
```

The CSV example supports quoted/multiline fields and up to 20,000 cells, using
host-owned edits, observations, undo/redo and explicit save. The host preserves
encoding/BOM and checks disk revisions. After building plugin-runtime, run
`node packages/plugin-runtime/scripts/browser-smoke.mjs` from the root for real
Chromium mounting/editing/saving and isolation checks. This does not exercise the
complete Electron workbench UI.

Maintained plugins live outside this repository in `~/workspace/eidos-plugins`.
To test the maintained React CSV plugin, run the browser smoke with `--react`.
Set `EIDOS_CSV_PLUGIN` if its source is outside the default
`~/workspace/eidos-plugins/eidos-csv-plugin` directory. Templates remain part of
this tool package for `eidos plugin create`.
