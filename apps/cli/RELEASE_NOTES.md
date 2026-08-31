## What's new

### Use standard SQLite functions in Formula fields

Formula fields now use a fixed SQLite 3.45 profile of 41 deterministic scalar
functions. The Runtime and the editor opened by `eidos serve` share the same
allowlist, validation, type inference, and autocomplete, so Formula expressions
remain portable across supported SQLite hosts.

This release removes the earlier Eidos-only function names. Before upgrading a
file that uses them, replace `IF` with `IIF`, `IS_NULL(value)` with
`value IS NULL`, and `LOWER_ASCII` / `UPPER_ASCII` with `LOWER` / `UPPER`.
Rewrite the old date and datetime helper functions with SQLite `DATE`,
`DATETIME`, `JULIANDAY`, `UNIXEPOCH`, `STRFTIME`, or `TIMEDIFF` expressions;
date/time modifiers must be string literals.

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

The installers select v1.0.0 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.
