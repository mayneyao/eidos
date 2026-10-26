## What's new

### Multilingual plugins in Serve

Serve supports compatible Plugin API 3.7 packages with bundled translations and language-specific documentation. Plugins follow the editor's language, including labels and messages inside their views. Chart can use the same internationalized package in Lite and Serve. Packages requiring host network access, including the new Map package, remain unsupported by Serve.

### Progressive table filters

Add filters by choosing a field, then its operator and value. Column menus provide a direct filter entry, while the shared editor supports combined conditions and nested groups.

## Improvements

- **File previews**: Shared file previews and record menus use consistent open actions, with thumbnails that remain visible while file data refreshes.

## Bug fixes

- **Metadata merges**: Recover validated merge metadata instead of leaving an otherwise valid merge unreadable.

## Use with an Agent

Initialize the Skill bundled with this CLI version in the current project or install it for your user:

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

The installers select v3.3.0 and verify the downloaded archive against the release `SHA256SUMS` before replacing an existing binary.

Create a local Eidos File with an initial table, then open its browser editor:

```sh
eidos file new notes.eidos --table notes --fields '[{"name":"Title","type":"text"}]'
eidos serve notes.eidos
```
