## What's new

### Relative date filters in Serve

Open files with saved relative date filters such as **Past 7 days** and
**This week**. The filters follow the calendar and use the configured time
zone. Create a record in a filtered view and the editor fills the values
determined by that view.

### Date and Datetime defaults

Date and Datetime fields can start with the current date or time when a
record is inserted. The CLI applies these defaults on ordinary insertions,
and full file validation recognizes the corresponding format capability.
Update the CLI and other editors before editing a shared file with these
features enabled.

## Use with an Agent

Initialize the Skill bundled with this CLI version in the current project or
install it for your user:

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

The installers select v3.4.0 and verify the archive against the release
`SHA256SUMS` before replacing the binary.

Create a local Eidos File with an initial table and open its browser editor:

```sh
eidos file new notes.eidos --table notes --fields '[{"name":"Title","type":"text"}]'
eidos serve notes.eidos
```
