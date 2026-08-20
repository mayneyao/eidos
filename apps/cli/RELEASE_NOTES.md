## What's new

### Plan records on a calendar

The editor embedded in the CLI now includes Calendar views. Choose a date or
datetime field, search and filter the same records as other views, move between
months, and create a record directly on an eligible day. A new preference also
lets each user start the week on Monday or Sunday.

### Faster table setup

Date filters now cover relative periods such as the current, previous, or next
day, week, month, and year. Select fields can assign a default option to newly
created records, and records created in sorted or filtered views stay in a
predictable position.

### Adaptive cards and record details

Gallery and Kanban cards, together with expanded record fields, now size long
text to its actual content up to a bounded maximum. Gallery cards remain aligned
within each row, while compact floating actions leave more room for content.

## Use with Codex

Install the Eidos Skill from this immutable CLI tag to keep the safe
`context` → `apply` → `validate` workflow aligned with the release:

```sh
npx skills add https://github.com/mayneyao/eidos/tree/cli-v0.36.10/skills/eidos --skill eidos -g -a codex -y
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

The installers select v0.36.10 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.
