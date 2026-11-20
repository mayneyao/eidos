## Improvements

### Read-only access to files with newer formulas

Use `eidos data query` to read stored fields from a valid Eidos File that
contains a formula this version cannot evaluate. The CLI protects the file
from edits.

`eidos serve` opens the file in read-only mode and marks unavailable
formula values. If a saved view depends on an unavailable formula, choose
**Browse records** to see the stored values.

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

The installers select v3.4.1 and verify the archive against the release
`SHA256SUMS` before replacing the binary.

Create a local Eidos File with an initial table and open its browser editor:

```sh
eidos file new notes.eidos --table notes --fields '[{"name":"Title","type":"text"}]'
eidos serve notes.eidos
```
