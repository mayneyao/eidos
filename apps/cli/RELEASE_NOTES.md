## What's new

### Check plugin compatibility before running

Use `eidos plugin doctor` to see the plugin API supported by your CLI, or `eidos plugin doctor ./example.eidos-plugin` to inspect a package without installing or executing it. JSON reports include the required API and any unsupported features.

Installation and `eidos serve` now reject incompatible plugins before loading them. A rejected update preserves the installed package. New packages can declare a minimum API; existing packages remain supported when their declared features are available.

The CLI supports table-view plugins. Desktop-only actions, connections and file-editor plugins require Eidos Lite and are rejected by the CLI.

## Improvements

- **Plugin authoring**: New projects use Plugin SDK and Tools 0.2. The check command reports compatibility with Lite and CLI, and packaging preserves the minimum API requirement in the new package format.

## Bug fixes

- **Serve dark mode**: Markdown previews follow the selected application theme instead of switching back to the system appearance.

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

The installers select v1.4.0 and verify the downloaded archive against the release `SHA256SUMS` before replacing an existing binary.
