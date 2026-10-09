## What's new

### Automate local file changes with plugins

Plugins can now register file hooks that run after local saves and renames. Markdown Title Sync uses this capability to keep a Markdown filename and its existing leading H1 heading in sync. Install and enable the plugin in a Space to use it; title synchronization is optional. An open document follows a hook-triggered rename so you can keep editing.

### Create tables with a Markdown body

Expand Advanced options when creating an Eidos File and select Include Markdown content to add a Text field for record bodies. Open a record to edit its body with the Markdown editor. The Content field is a table setting shared by all views and can be changed later in Table settings.

## Improvements

- **Plugin settings**: Settings generated from plugin configuration use consistent labels, descriptions, controls and spacing. Connection settings use the same layout, with clear save, error and retry states.
- **Plugin details**: The header displays each plugin's own description. Discovery and permission summaries better explain the capabilities a plugin uses.
- **New files**: Advanced options use a compact collapsible layout with clearer explanations.
- **Version history**: Merge inspection avoids unnecessary repository-wide work.

## Bug fixes

- **Local changes**: Opening or applying unchanged table and field settings no longer creates spurious schema changes or checkpoints.
- **Markdown**: Touch selection and character-by-character deletion work inside links without deleting the whole URL. The editor reserves scrollbar space to avoid horizontal jumps when entering edit mode.
- **Files**: Records in folder metadata tables open their mapped ordinary files correctly.
- **Editor preference**: The selected Markdown editor persists when changing the default file editor.
- **Publish**: File publication offers compatible read-only plugin Views.
- **Terminal**: Text remains readable in the light theme.
