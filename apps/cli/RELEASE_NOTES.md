## What's new

### Plugin management and authoring

Use `eidos plugin search`, `info`, `install`, `list`, and `uninstall` to manage plugins from the registry or local `.eidos-plugin` packages. Installations share the device plugin store with Eidos Lite. Removing a plugin clears its saved Space enablement and resource grants.

Create a plugin project, check its types, and build an offline package:

```sh
eidos plugin create my-plugin
cd my-plugin
npm install
eidos plugin check .
eidos plugin pack .
```

Source checking and packaging require Node.js 22.12 or newer and the project's plugin-tools dependency. Registry and local package management run directly in the CLI. The dev/inspect/invoke/accept/rollback authoring workflow is not available yet.

## Improvements

- **Serve Feed timestamps**: Records display relative timestamps for recent activity.

## Bug fixes

- **Serve record editing**: Pressing Enter in a record title moves focus into its Content editor.
- **Publish default view**: Publishing without an explicit view uses the first saved view.
- **Publish on Windows**: Source hashing no longer uses a large stack buffer that could crash publishing with a stack overflow.

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

The installers select v1.3.0 and verify the downloaded archive against the release `SHA256SUMS` before replacing an existing binary.
