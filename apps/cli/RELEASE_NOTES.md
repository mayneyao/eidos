## What's new

### Rename Select options safely in Serve

The editor opened by `eidos serve` can rename Select and Multi-select options
without leaving existing records or Saved Views behind. Before applying a
rename, it shows how many rows and dependencies will change and asks for
confirmation when values must be rewritten or merged.

### Keep Saved Views valid as schemas evolve

`eidos validate` now reports Saved View filters, groups, and sorts that refer to
missing fields. The embedded Runtime also preserves compatible legacy query
storage while normalizing field references, so schema changes do not silently
leave views with stale dependencies.

### Return to the last Grid cell after menus close

Pressing Escape to close a Grid menu now restores focus to the last active cell
in the editor opened by `eidos serve`, keeping keyboard navigation continuous.

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

The installers select v0.39.0 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.
