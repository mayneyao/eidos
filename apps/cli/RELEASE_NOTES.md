## What's new

### Use today's date in formulas

Create a Formula field with `TODAY()` in the browser editor opened by
`eidos serve`. Use `DATE(TODAY(), '+1 day')` to get tomorrow's date.

Pass `--time-zone Asia/Shanghai` to `eidos data query` or
`eidos formula preview` to evaluate the formula in that time zone. Add
`--reference-instant` to reproduce the result for a specific UTC instant.
Update the apps that edit or sync the file before adding this formula.
If you sync the file with iOS, wait for an iOS update that supports `TODAY()`
before adding the formula.

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

The installers select v3.5.0 and verify the archive against the release
`SHA256SUMS` before replacing the binary.

Create a local Eidos File with an initial table and open its browser editor:

```sh
eidos file new notes.eidos --table notes --fields '[{"name":"Title","type":"text"}]'
eidos serve notes.eidos
```
