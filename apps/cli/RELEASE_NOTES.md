## Improvements

- **Serve plugins**: Table views use Plugin API 3 with `ctx.capabilities.eidos.table` for context, rows, aggregation, view configuration, and record navigation. Installed executable plugins must declare `requires.pluginApi: "3.0.0"`; older packages need to be updated before they can run.
- **Plugin development guidance**: The bundled Eidos Skill describes the capability interface and current authoring templates. Developers can follow the [migration guide](https://github.com/mayneyao/eidos/blob/dev/docs/migrations/eidos-plugins.md) to update existing plugins. CLI command namespaces and Eidos File data remain unchanged.

## Bug fixes

- **Custom plugin directory**: With `EIDOS_HOME` set, Serve now discovers plugins in the same directory used by `eidos plugin install`.

## Use with an Agent

Initialize the Skill bundled with this CLI version in the current project or install it for your user:

```sh
eidos self skill init
eidos self skill init --global
```

## Install

Install this release candidate on macOS or Linux:

```sh
curl -fsSL https://download.eidos.space/cli/install.sh | sh -s -- --version 3.0.0-rc.1
```

On Windows, download the archive from this release, verify it against `SHA256SUMS`, and extract the `eidos` binary. Confirm the installation with `eidos --version`; it should report `3.0.0-rc.1`.

Stable installers continue to select the previous stable release during candidate testing.
