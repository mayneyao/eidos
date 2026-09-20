## What's new

### Plugins in the CLI and local editor

Discover and manage plugins from the official registry with `eidos plugin search`, `info`, `install`, `list`, and `uninstall`. Plugins use the same device-wide store as Eidos Lite, so an installed plugin is available in both the desktop app and `eidos serve`.

Create a File, install the Chart plugin, and open the local editor:

```sh
eidos create sales.eidos \
  --table Sales \
  --label-field Product \
  --fields '[{"name":"Product","type":"text"},{"name":"Amount","type":"number"}]'
eidos plugin install eidos.chart
eidos serve sales.eidos --open
```

Use `--plugin <package.eidos-plugin>` to load a specific package or `--plugins-dir <directory>` to load a separate plugin directory. Serve also discovers packages in `.eidos/plugins` beside the File.

### Plugin project tools

Create a TypeScript plugin project, check it, and build a self-contained offline package:

```sh
eidos plugin create my-plugin
cd my-plugin
npm install
eidos plugin check .
eidos plugin pack .
```

Checking and packaging require Node.js 22.12 or newer and the generated project's dependencies. Interactive `dev`, `inspect`, `invoke`, `accept`, and `rollback` authoring sessions are not available yet.

## Improvements

- **Serve Feed timestamps**: Recent records display relative timestamps, making activity easier to scan.

## Bug fixes

- **Serve record editing**: Pressing Enter in a record title moves focus into its Content editor.
- **Publish default view**: Publishing without an explicit view uses the first saved view.
- **Publish on Windows**: Source hashing no longer uses a large stack buffer that could crash publishing.

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
