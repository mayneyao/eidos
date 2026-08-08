## What's new

### Local web editor on Windows

`eidos serve` now opens the embedded Eidos File editor on Windows x64 as well
as macOS and Linux:

```powershell
eidos serve tracker.eidos --open
```

The Windows release uses the same embedded QuickJS runtime, rusqlite bridge,
loopback-only HTTP server, and direct-to-file mutation path as the Unix
builds. The release pipeline compiles and tests the complete workspace on
MSVC, then starts the packaged `.exe`, opens the runtime API, and verifies the
embedded editor assets before publishing it.

### Consistent embedded editor UI

The CLI editor now consumes the same host theme, typography, Tailwind source,
and Eidos File UI components as Eidos Web and Lite. This also removes the
stale generated-package path that could make `eidos serve` display older
styles than the current editor source.

### Intuitive negative filters

Negative filters now use total boolean semantics. For example, `Priority is
not P2` includes rows whose Priority is blank, while `is null` and `is not
null` remain the explicit blank-value operators. The behavior is aligned
between the format specification, runtime, and Rust CLI query engine.

### Version-matched Eidos Skill for Codex

Install the Eidos Skill from the same immutable CLI tag to keep the safe
`context` → `apply` → `validate` workflow aligned with this release:

```sh
npx skills add https://github.com/mayneyao/eidos/tree/cli-v0.36.0/skills/eidos --skill eidos -g -a codex -y
```

## Install

macOS or Linux:

```sh
curl --proto '=https' --tlsv1.2 -LsSf https://download.eidos.space/cli/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://download.eidos.space/cli/install.ps1 | iex
```

The installers select v0.36.0 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.
