## Bug fixes

- **Serve row editing**: Adding a table row and immediately typing into its cells preserves the entered values. Pending row writes finish in order, preventing revision errors and new rows disappearing while you edit.

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

The installers select v3.3.2 and verify the downloaded archive against the release `SHA256SUMS` before replacing an existing binary.

Create a local Eidos File with an initial table, then open its browser editor:

```sh
eidos file new notes.eidos --table notes --fields '[{"name":"Title","type":"text"}]'
eidos serve notes.eidos
```
