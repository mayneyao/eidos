## What's new

### Publish and collect from the terminal

`eidos publish` now publishes Eidos Files, Markdown documents, and Form views
with attachments, access controls, visible upload progress, unchanged-version
detection, and bounded delta uploads for later Eidos File versions. The new
`eidos collect` command imports committed Form responses back into the source
Eidos File with retry-safe receipts.

### Build complete agent workflows with intent commands

Agents can now upsert rows by business key, apply mixed row batches, and create
or manage Tables, Fields, Relations, and saved Views through user-facing
commands. Revision checks, exact-match assertions, dry runs, and atomic
validation remain part of the mutation boundary.

### Work with Formula and Lookup fields

New `formula` and `lookup` commands preview, create, update, and delete derived
Fields through the canonical Eidos Runtime. `query`, `context`, and `validate`
now evaluate Formula, Lookup, and inverse Relation values instead of exposing
an incomplete stored-only projection.

## Use with Codex

Install the Eidos Skill from this immutable CLI tag to keep the safe
`context` → `apply` → `validate` workflow aligned with the release:

```sh
npx skills add https://github.com/mayneyao/eidos/tree/cli-v0.37.1/skills/eidos --skill eidos -g -a codex -y
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

The installers select v0.37.1 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.
