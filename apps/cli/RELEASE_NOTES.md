## What's new

### Scaffold plugins with contribution templates

Use `eidos plugin create <directory> --template <name>` to bootstrap new plugins from official templates, including table views, table actions, full-page views, document editors, and standalone themes. The new `theme` template sets up an offline CSS theme project ready to package for Eidos Lite.

### Validate plugins against target hosts

The `eidos plugin check` command now supports `--target <desktop|cli>`. Validate your plugin against specific host requirements and API levels before distribution to verify that declared views, actions, workspace permissions, and theme stylesheets are supported by the target environment.

## Improvements

- **Serve UI**: Embedded serve interface inherits updated semantic theme tokens and webfont rendering improvements.

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

The installers select v1.5.0 and verify the downloaded archive against the release `SHA256SUMS` before replacing an existing binary.
