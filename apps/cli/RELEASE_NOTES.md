## Bug fixes

- **Serve keyboard search**: Closing row search with Escape restores focus to the grid so you can navigate cells and immediately search again.
- **Plugin loading**: Localized packages retain their bundled resources, and isolated guest modules avoid duplicate binding errors when loading compatible plugin views.

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

The installers select v3.3.1 and verify the downloaded archive against the release `SHA256SUMS` before replacing an existing binary.

Create a local Eidos File with an initial table, then open its browser editor:

```sh
eidos file new notes.eidos --table notes --fields '[{"name":"Title","type":"text"}]'
eidos serve notes.eidos
```
