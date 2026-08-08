## What's new

### Local web editor on macOS and Linux

`eidos serve` opens an Eidos File in a dedicated local web editor whose UI and
runtime are embedded in the CLI binary:

```sh
eidos serve tracker.eidos --open
```

The server binds to `127.0.0.1` only. Edits are committed directly to the
opened `.eidos` file through the embedded QuickJS and rusqlite runtime, so
there is no separate save or external web service.

`eidos serve` is not available in the Windows build yet; the existing JSON CLI
commands remain available on every published platform.

### Version-matched Eidos Skill for Codex

The release now publishes and verifies the Eidos Skill from the same immutable
CLI tag. It teaches Codex the safe `context` → `apply` → `validate` workflow:

```sh
npx skills add https://github.com/mayneyao/eidos/tree/cli-v0.35.0/skills/eidos --skill eidos -g -a codex -y
```

### Schema naming behavior

Table and stored-field physical names now remain identical to their display
names. Schema creation and rename reject SQLite `NOCASE` duplicates instead of
inventing hidden physical aliases, and user table names beginning with
`sqlite_` or `eidos__` are rejected.

## Install

macOS or Linux:

```sh
curl --proto '=https' --tlsv1.2 -LsSf https://download.eidos.space/cli/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://download.eidos.space/cli/install.ps1 | iex
```

The installers select v0.35.0 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.
