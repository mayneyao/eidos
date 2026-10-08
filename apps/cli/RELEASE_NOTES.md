## What's new

### Publish ordinary files with a plugin view

`eidos cloud publish` can publish an ordinary file as a download or render it using a read-only plugin file View. Pass `--plugin` with the plugin package and `--plugin-view` with its View ID. A GPX file, for example, can become a map page. The publication captures both the file and plugin as immutable snapshots. Requires a Pro account and an `EIDOS_PUBLISH_TOKEN` CLI key.

Use `--source-path` to preserve a file's original Space-relative path independently of its public slug.

## Improvements

- **Serve on touch screens**: Shared mobile navigation and record editing make local files easier to browse on smaller screens.
- **Plugin tools**: The bundled Skill covers file templates, embedded file and saved views, host downloads, and the current plugin authoring interfaces.

## Bug fixes

- **Markdown task lists**: Empty checked and unchecked tasks preserve their state after saving and reopening, including nested and loose lists.
- **New grid records**: Appending a row focuses its first editable field even when leading fields are hidden or read-only.

## Use with an Agent

Initialize the Skill bundled with this CLI version in the current project or install it for your user:

```sh
eidos self skill init
eidos self skill init --global
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

The installers select v3.1.0 and verify the downloaded archive against the release `SHA256SUMS` before replacing an existing binary.
