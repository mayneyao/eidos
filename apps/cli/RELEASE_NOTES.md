## What's new

### Keep attachments visible after restarting Serve

When `eidos serve` restarts on the same address, an already-open browser now
detects the new Serve process, reopens its Runtime session, and reloads asset
capabilities automatically. Attachments render again without manually
refreshing the page, including after restarting Serve with `--assets-dir`.

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

The installers select v0.39.1 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.
