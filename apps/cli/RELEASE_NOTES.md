## What's new

### New files open with a ready-to-use Grid

Creating a file with an initial table now makes that table the File default
and creates its first Grid view in the same initial revision:

```sh
eidos create example.eidos \
  --title "Example" \
  --table Tasks \
  --label-field Title \
  --fields '[{"name":"Title","type":"text"},{"name":"Status","type":"select"}]'
eidos serve example.eidos --open
```

The local editor opens directly on the saved Grid view, and its first blank row
can be added without a `NOT NULL` failure.

### Clear required-value errors

When an advanced schema declares a non-null scalar Field, a create mutation
that omits it now returns the Runtime's structured `invalid-value` error before
SQLite write. SQLite constraint messages no longer escape through this path.

The CLI Serve Tasks template also keeps ordinary fields nullable until a
dedicated required-field editing flow is available.

### Version-matched Eidos Skill for Codex

Install the Eidos Skill from the same immutable CLI tag to keep the safe
`context` → `apply` → `validate` workflow aligned with this release:

```sh
npx skills add https://github.com/mayneyao/eidos/tree/cli-v0.36.2/skills/eidos --skill eidos -g -a codex -y
```

## Install

macOS or Linux:

```sh
curl -LsSf https://download.eidos.space/cli/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://download.eidos.space/cli/install.ps1 | iex
```

The installers select v0.36.2 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.
