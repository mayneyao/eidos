# Eidos plugin starter

Source code lives in `src/`; `plugin.json` declares contexts and entry points.

## Develop

Use Node.js >=22.12:

```sh
npm install
npm run check
npm run pack:plugin
```

In Eidos Lite, open Plugins → Load development source and select `plugin.json`.
Enable the plugin for a test Space. Source changes reload automatically.
Manifest/permission changes require review. A development load does not replace
the installed package; install the archive to keep the revision after restart.

The `theme` starter is different: its data-only `plugin.json` points to
`theme.css`, which contains light and dark palettes for the Eidos Lite host.
After loading or installing it, open its
detail page and choose **Apply theme**. This selection applies to every Space;
theme plugins are not enabled per Space. Edit `theme.css` and pack the theme as
a standalone `.eidos-plugin` archive. CLI Serve does not support themes.

| Template      | Try it                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| document-view | Create a CSV, then Open with → CSV Table. Edit, save, undo and redo.                                            |
| eidos-view    | Open an .eidos file with File overview to inspect tables and fields.                                            |
| table-view    | Open a table and add Record count from its view menu.                                                           |
| table-action  | Add a writable checkbox field, select records, and use Mark … complete in the context menu. Test Undo this run. |
| page          | Open Hello page from plugin navigation or run Open hello page from the command palette.                         |
| theme         | Apply the host theme in Plugin Manager; switch Lite between light and dark appearance.                          |

For table-action, `npm test` exercises pagination, cancellation, and schema changes
with a small mock context. It does not replace testing against the real host.
Try single-row, selected rows, and all filtered records in Lite.

## Compatibility and debugging

`npm run check -- --target lite` fails if the bundled compatibility profile
does not support the plugin. Use `--target cli` for CLI Serve. CLI Serve supports
Table Views, not every Lite capability. Eidos Views and Table Actions require
Plugin API 1.1 (Lite 0.17+). Check output reflects the installed tool's profiles;
`eidos plugin doctor <package>` checks against your installed CLI.

Use `npm run check -- --json` for structured diagnostics. Type-only SDK imports
are erased. Browser code cannot import Node APIs or remote/CDN modules.
Install and lock third-party dependencies locally.
For loading errors, inspect the plugin's error banner and re-check the source.
Catch asynchronous event-handler errors and present them in your UI.
Use developer tools for iframe console/stack traces where the host exposes them.
There is currently no CLI authoring session or standalone mock host server.

## Package and submit

`npm run pack:plugin` writes a self-contained archive and an adjacent
`.sha256` file to `dist/`. Upload immutable assets to a GitHub Release.
Generate a registry entry draft from the exact archive with:

```sh
npx --no-install eidos-plugin registry dist/local.my-plugin-0.1.0.eidos-plugin \
  --repo owner/repository --category productivity \
  --description "Describe what users can do" \
  --compatibility "Requires Eidos Lite 0.17.0 or later."
```

Replace the example filename, ID, repository, and compatibility with your values.
The generated tag assumes `v<version>`; adjust it if your release uses another tag.
Submit the entry to https://github.com/eidos-space/registry. The command creates
a draft only: it does not publish or open a pull request.

See https://docs.eidos.space/plugins/concepts/ and
https://docs.eidos.space/plugins/guide/ for concepts and APIs.
