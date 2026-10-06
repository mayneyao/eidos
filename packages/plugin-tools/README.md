# Plugin tools maintenance

Read the public [development guide](../../apps/docs/src/content/docs/plugins/guide.mdx)
([中文](../../apps/docs/src/content/docs/zh-cn/plugins/guide.mdx)) for the installed
workflow. This document is for repository maintainers.

This package owns plugin creation, checking, development and packaging. CLI 2.0
rejects the old authoring commands with migration instructions. SDK imports are types only; runtime capabilities are injected
through `mount(ctx, root)`. Check and pack accept directories containing `plugin.json`
or standalone TS/JS sources, without executing plugin code or build configuration.

## Checkout setup

```sh
pnpm install
pnpm --filter @eidos.space/eidos-file build
pnpm --filter @eidos.space/plugin-sdk build
pnpm --filter @eidos.space/plugin-runtime build
pnpm --filter @eidos.space/plugin-tools build
cargo build --locked
node packages/plugin-tools/bin/eidos-plugin.mjs create /tmp/my-csv-editor
node packages/plugin-tools/bin/eidos-plugin.mjs check /tmp/my-csv-editor
node packages/plugin-tools/bin/eidos-plugin.mjs pack /tmp/my-csv-editor --out /tmp/my-csv-editor.eidos-plugin
EIDOS_PLUGIN_CLI="$PWD/target/debug/eidos" pnpm --filter @eidos.space/plugin-tools test
```

The bridge requires Node.js >=22.12. `@eidos.space/plugin-tools` bundles its
compiler backend into `dist/compiler.js` and its SDK contract into `dist/contracts.ts`
via `build.mjs` and is published to npm
alongside `@eidos.space/plugin-sdk`. Developers can use `npx @eidos.space/plugin-tools create`
for authoring; `eidos plugin doctor` inspects CLI host compatibility. Dependency-free compilation uses
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

Pack creates bounded gzip JSON `{format: 1 | 2, manifest, modules}` with self-contained
browser modules. The old HTML envelope is rejected. Installed plugins need neither
Node nor a network connection for bundled code. Lite supports page/file views with optional document, Eidos or table capabilities,
actions, scoped filesystem access, settings and connections according to the API contract. CLI Serve has a narrower Table View profile;
use target checks rather than assuming host parity.
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
this tool package for `npx @eidos.space/plugin-tools create`.

`templates/catalog.json` and `templates/project.json` define the starters.
Build the Rust binary before testing CLI migration errors and compatibility
inspection of packages produced by this tool:

```sh
EIDOS_PLUGIN_CLI="$PWD/target/debug/eidos" pnpm --filter @eidos.space/plugin-tools test
```

The tests compile all templates, test action
pagination/cancellation, checks target-host failures, and verifies release hashes.
See the bilingual development workflow for `templates`, `--template`, `--target`,
checksum output and the `registry` draft helper. This source revision targets executable API 3.0.0 with SDK/tools 0.5.0, including
the shared Lite/Serve table-view starter. Themes retain API 1.6.0. Matching SDK,
tools and hosts must be released before using npm-installed API 3 starters;
until then use checkout builds. See the migration guide for existing plugins.
