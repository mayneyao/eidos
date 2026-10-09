## Bug fixes

- **Command examples**: Table-creation examples now use the CLI's lowercase
  field type names. The release-note example is executed and its resulting
  Eidos File validated when testing the CLI.

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

The installers select v3.2.1 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.

Create a local Eidos File with an initial table, then open its browser editor:

```sh
eidos file new notes.eidos --table notes --fields '[{"name":"Title","type":"text"}]'
eidos serve notes.eidos
```
