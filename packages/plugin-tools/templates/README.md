# CSV editor plugin

The plugin exports `mount(ctx, root)` and uses the host TextDocument working copy.
No runtime SDK import, connect call, or explicit build step is required in Lite.

In Eidos Lite, open File editor plugins and load a development source. Select
`plugin.json`, review its document access, then open a CSV with CSV Table.
Source changes reload automatically; declaration changes require a fresh review.
Development reloads are trials and do not replace the installed revision on restart.

Use `eidos plugin check` to validate source and types, and `eidos plugin pack`
to generate a distributable `.eidos-plugin`. The host supplies its compiler;
install `@eidos.space/plugin-sdk` for IDE types when desired. Third-party runtime
libraries must be installed and locked locally before loading.

This example handles quoted commas, escaped quotes and multiline fields. It
preserves record separators and normalizes quoting on edits. It limits its DOM
to 20,000 cells. The host limits complete encoded text to 2 MiB and preserves BOM.
Undo/redo uses host history. Stale edits retain visible input; disk conflicts
retain the host working copy. Use the built-in editor for recovery/save-copy.
