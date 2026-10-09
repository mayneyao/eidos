## What's new

### Add Markdown bodies when creating tables in Serve

When creating a table in `eidos serve`, select the Markdown content option to
add a Text field for record bodies. Opening a record provides the Markdown
editor, and the body is stored in that field. The Content field is configured
for the table and shared by its views.

Try Serve with a new local file:

```sh
eidos file new notes.eidos --table notes --fields '[{"name":"Title","type":"Text"}]'
eidos serve notes.eidos
```

## Bug fixes

- **Schema changes**: Applying unchanged table or field settings no longer
  records a schema mutation.
- **Markdown editing**: Touch selection and character-by-character deletion
  work within links. Scrollbar space is reserved to prevent horizontal jumps
  when entering edit mode.
- **Record fields**: Text fields used as Markdown bodies keep the correct
  visibility and editing behavior in the shared editor.

## Use with an Agent

Initialize the Skill bundled with this CLI version in the current project or
install it for your user:

```sh
eidos self skill init
eidos self skill init --global
```

## Install

macOS or Linux:

```sh
curl -fsSL https://download.eidos.space/cli/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://download.eidos.space/cli/install.ps1 | iex
```

The installers select v3.2.0 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.
