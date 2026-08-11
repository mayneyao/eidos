## What's new

### Readable terminal output by default

Eidos CLI now prints concise key-value sections and tables for interactive use.
File inspection, schema details, row queries, mutations, and validation results
are easier to scan directly in a terminal without piping every command through
a JSON formatter.

Errors use the same human-readable default and preserve useful details such as
the current revision when an optimistic update is stale.

### Stable JSON for Agents and scripts

Pass the global `--json` flag whenever a machine consumes the result:

```sh
eidos --json inspect tracker.eidos
eidos --json query tracker.eidos Tasks --fields Title,Status --limit 50
```

JSON mode retains the existing stable contract: one JSON document on stdout
for success and one JSON error document on stderr for failure. The flag works
with both command-first and file-first forms, including
`eidos --json tracker.eidos inspect`.

The bundled Eidos Skill and automation documentation now pass `--json`
explicitly, keeping Agent workflows deterministic while making the default CLI
friendlier for people.

### Version-matched Eidos Skill for Codex

Install the Eidos Skill from this immutable CLI tag to keep the safe
`context` → `apply` → `validate` workflow aligned with the release:

```sh
npx skills add https://github.com/mayneyao/eidos/tree/cli-v0.36.7/skills/eidos --skill eidos -g -a codex -y
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

The installers select v0.36.7 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.
