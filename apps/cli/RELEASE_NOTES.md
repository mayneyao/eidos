## What's new

### Use `eidos serve` from another device on a trusted LAN

`eidos serve` still binds to `127.0.0.1` by default. The new `--lan` mode
detects and binds one private interface so the same embedded editor can be
opened from a phone, tablet, or another computer:

```sh
eidos serve tracker.eidos --lan
eidos serve tracker.eidos --lan --host 192.168.1.20
```

The printed URL carries a fragment-only access key. Opening it establishes a
process-local, HttpOnly browser session; API Host and Origin checks remain
restricted to the exact bound address. Public and wildcard bind addresses are
rejected.

LAN mode uses plain HTTP and is intended only for a private network you trust.

### Smoother multi-browser editing

All paired browsers share one authoritative Runtime writer. Mutations remain
serialized, and committed revisions are pushed to the other browsers without
a manual refresh.

When two browsers edit different ordinary fields at the same time, the stale
edit can now be reapplied once after the editor reads fresh state and verifies
that the edited field still equals its original value. Overlapping edits,
second stale revisions, Relation or File writes, schema/View changes, and
unknown commit outcomes continue to preserve the draft and require explicit
user choice.

### Version-matched Eidos Skill for Codex

Install the Eidos Skill from this immutable CLI tag to keep the safe
`context` → `apply` → `validate` workflow aligned with the release:

```sh
npx skills add https://github.com/mayneyao/eidos/tree/cli-v0.36.4/skills/eidos --skill eidos -g -a codex -y
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

The installers select v0.36.4 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.
