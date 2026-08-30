## What's new

### Initialize the matching Agent Skill without Node.js

The CLI now carries its matching Eidos Skill. Run `eidos skills init` in a
Space or project, use `--space <DIR>` for another location, or add `--global`
to install it for the current user. Repeating the command is safe, while
`--force` is required before replacing locally edited Skill files.

### Plan in month or week views

The editor opened by `eidos serve` can switch Calendar views between month and
week layouts. Week view shows more records per day, multiple busy days can stay
expanded independently, and datetime records retain a compact time label
without introducing an hourly schedule grid.

### Read cards and published pages with less visual noise

Kanban cards in the embedded editor now use quieter group surfaces, lighter
card boundaries, and native-looking scrollbars. Published views also adapt
their toolbar, grid markers, frozen columns, and record panel to narrow browser
windows.

## Use with an Agent

The CLI now bundles the matching Eidos Skill. Initialize it in the current
Space/project or install it for the current user without Node.js or `npx`:

```sh
eidos skills init
eidos skills init --global
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

The installers select v0.38.0 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.
