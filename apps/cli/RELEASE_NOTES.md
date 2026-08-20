## What's new

### Preserve views created by newer Eidos versions

The embedded editor now keeps unfamiliar view, filter, and sort configuration
intact. Unsupported views remain visible with an update-required explanation,
while partial queries and exports are blocked instead of silently displaying
incorrect rows or replacing settings the installed CLI does not understand.

### Keep date and time behavior consistent

Date-time values, editors, record details, and Calendar grouping now agree on
the Serve host's time zone, including daylight-saving transitions. Calendar
records also expose their normal open, copy-ID, and delete actions from the
context menu.

## Use with Codex

Install the Eidos Skill from this immutable CLI tag to keep the safe
`context` → `apply` → `validate` workflow aligned with the release:

```sh
npx skills add https://github.com/mayneyao/eidos/tree/cli-v0.36.11/skills/eidos --skill eidos -g -a codex -y
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

The installers select v0.36.11 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.
