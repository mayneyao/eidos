## Bug fixes

- **Serve Content editing**: Expanded record pages now use the same rich Markdown editor as Eidos Lite instead of falling back to a plain text box. Editing and preview share Eidos syntax and resolve images through the mounted asset directory.
- **Record controls**: Fix missing record expansion in Feed and incomplete full-page and previous/next controls outside Grid. Navigation now reaches the Runtime through the browser adapter and follows the current View's filter and order.

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

The installers select v1.2.1 and verify the downloaded archive against the release `SHA256SUMS` before replacing an existing binary.
