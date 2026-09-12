## Bug fixes

- **Serve Content images**: Record Content pages now resolve relative Markdown and HTML image paths through the mounted asset directory, so local images display in the browser editor opened by `eidos serve`.
- **Multi-select conversion**: Converting Text containing a JSON string array now preserves its individual choices. Plain text stays a single choice, and duplicate choices are still rejected.

## Improvements

- **Serve attachment preview**: Copy an image directly from its attachment preview. Open, download, and copy actions use compact labels and keep their layout stable while copying.

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

The installers select v1.1.2 and verify the downloaded archive against the release `SHA256SUMS` before replacing an existing binary.
