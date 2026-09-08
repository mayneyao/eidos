## What's new

### Automate File-field attachments

Use `eidos attachment import`, `attach`, `detach`, and `verify` to manage attachments from scripts and agents. Revision checks protect writes, and verification checks referenced files before you share or publish a file.

### Apply richer schema changes with an agent

Update tables, fields, and relations through revision-checked schema operations. Conversion preflight reports the planned impact, while schema batches resolve logical names so agents can build related structures without manually stitching together IDs.

## Improvements

- **Serve editor**: Refine record pages, add side-panel record navigation, support copying read-only field values, and simplify Formula result previews.
- **Structured fields**: Use field-specific search and filter capabilities, preserve Integer values during CSV handling, and support pasting Relation values.

## Bug fixes

- **Relation lookups**: Preserve relation result types, display linked record labels, and navigate to the correct target record in Serve.
- **Validation**: Detect invalid reserved field indexes and validate optional Markdown content fields.

## Use with an Agent

Initialize the Skill bundled with this CLI version in the current project or install it for your user:

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

The installers select v1.1.0 and verify the downloaded archive against the release `SHA256SUMS` before replacing an existing binary.
