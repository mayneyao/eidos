## What's new

### Feed view

`eidos serve` now offers the Feed standard View, which reads a Table as a timeline: newest records come first, titled by the Record Label with the Content Field rendered as Markdown.

### Record navigation

Record Content renders through the shared Eidos Markdown preview, so Eidos syntax, highlighted code, and document-local images resolve through the mounted asset directory. The record panel moves to the previous or next record in the current View's order and switches between the side panel and the full content page.

## Bug fixes

- **Field conversion**: Converting a JSON string array in a Text field into Multi-select now yields one choice per value, and converted scalar cells can be cleared.

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

The installers select v1.2.0 and verify the downloaded archive against the release `SHA256SUMS` before replacing an existing binary.
