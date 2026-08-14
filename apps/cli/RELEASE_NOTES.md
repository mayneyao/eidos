## What's new

### Verified self-upgrade

Eidos CLI can now upgrade its own standalone installation to the latest stable
release:

```bash
eidos upgrade
```

The command resolves the same stable version and platform archive as the public
installers. It verifies the archive against the Release `SHA256SUMS`, extracts
the candidate into a private temporary directory, and requires the candidate's
own `eidos --version` output to match before replacing the running executable.
An already-current installation is a no-op.

Use `eidos upgrade --version <semver>` to install an exact release. Reinstalling
the current version or intentionally downgrading also requires `--force`. On
Windows, a one-time helper completes the verified replacement after the running
CLI process exits; macOS and Linux replace it atomically while preserving its
executable permissions.

### Version-matched Eidos Skill for Codex

Install the Eidos Skill from this immutable CLI tag to keep the safe
`context` → `apply` → `validate` workflow aligned with the release:

```sh
npx skills add https://github.com/mayneyao/eidos/tree/cli-v0.36.9/skills/eidos --skill eidos -g -a codex -y
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

The installers select v0.36.9 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.
