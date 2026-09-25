## What's new

### Reorganized command namespaces

Eidos CLI 2.0 reorganizes commands into clear, atomic namespaces:

- `file`: `new`, `inspect`, `validate`, `repair`
- `schema`: `dump`, `apply`, `table`, `field`, `view`
- `data`: `query`, `mutate`, `compact`, `asset`
- `serve`: embedded local and LAN web editor
- `cloud`: `login`, `whoami`, `logout`, `publish`, `collect`
- `self`: `skill`, `upgrade`
- `plugin`: `list`, `install`, `remove`, `inspect`

Legacy 1.x flat commands (`eidos create`, `eidos context`, `eidos rows`, etc.) remain available as hidden aliases for backward compatibility.

### Plugin authoring migration

Plugin scaffolding and packaging commands (`create`, `check`, `dev`, `pack`) have moved to `@eidos.space/plugin-tools` via `npx @eidos.space/plugin-tools <command>`. The core `eidos plugin` command focuses on managing installed plugins.

## Improvements

- **Compact context**: `eidos data query --compact` provides bounded context and schema for agent loops.
- **Formula preview**: `eidos schema field preview` supports safe formula evaluation before writing.
- **Serve UI**: Embedded serve interface inherits updated semantic theme tokens.

## Use with an Agent

Initialize the Skill bundled with this CLI version in the current project or install it for your user:

```sh
eidos self skill init
eidos self skill init --global
# legacy alias: eidos skills init --global
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

The installers select v2.0.0 and verify the downloaded archive against the release `SHA256SUMS` before replacing an existing binary.
