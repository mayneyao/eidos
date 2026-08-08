## What's new

### Empty files open correctly in the local editor

Files created without an initial table now open in `eidos serve` instead of
remaining on the loading screen:

```sh
eidos create example.eidos --title "Example"
eidos serve example.eidos --open
```

The editor shows the shared Eidos File empty state and can create the first
table from a blank, tasks, or project-tracker template. Once created, the table
is saved directly to the served file.

### Consistent empty-state behavior

CLI Serve now uses the same empty-state component and first-table templates as
Eidos File Web and Eidos Lite. Loading, empty, and ready states are resolved
explicitly so a valid tableless Eidos File is not mistaken for a booting file.

### Version-matched Eidos Skill for Codex

Install the Eidos Skill from the same immutable CLI tag to keep the safe
`context` → `apply` → `validate` workflow aligned with this release:

```sh
npx skills add https://github.com/mayneyao/eidos/tree/cli-v0.36.1/skills/eidos --skill eidos -g -a codex -y
```

## Install

macOS or Linux:

```sh
curl --proto '=https' --tlsv1.2 -LsSf https://download.eidos.space/cli/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://download.eidos.space/cli/install.ps1 | iex
```

The installers select v0.36.1 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.
