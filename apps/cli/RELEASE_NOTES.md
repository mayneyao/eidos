## What's new

### Mount an assets folder in `eidos serve`

Create an Eidos File with a File field and an explicit assets directory:

```sh
mkdir -p assets

eidos create gallery.eidos \
  --table Gallery \
  --label-field Name \
  --fields '[{"name":"Name","type":"text"},{"name":"Attachment","type":"file"}]'

eidos serve gallery.eidos --assets-dir ./assets --open
```

The embedded editor can now preview existing `assets/<name>` File entries and
upload new files through the picker, drag and drop, or clipboard paste. Uploads
use collision-safe names and persist through the normal Eidos Runtime mutation,
so images remain visible after a refresh or a new Serve process.

The mount is an explicit capability. Without `--assets-dir`, Serve does not
guess, read, or write a sibling directory. Mounted paths stay inside the chosen
directory, only `assets/` references are resolved, each upload is limited to
256 MiB, and previews are limited to 64 MiB.

### File-cell paste and refresh fixes

Image paste now works when the browser delivers the paste event to the page
body while a File cell is selected. Serve also recognizes the Runtime's
canonical `file` value type when rebuilding its attachment cache, fixing the
case where an upload appeared immediately but disappeared after refresh.

The same shared editor behavior remains available over loopback, a paired LAN
session, or Eidos Relay. A remote browser receives the mounted upload authority
for the lifetime of the Serve process, so mount only a directory intended for
those users.

### Version-matched Eidos Skill for Codex

Install the Eidos Skill from this immutable CLI tag to keep the safe
`context` → `apply` → `validate` workflow aligned with the release:

```sh
npx skills add https://github.com/mayneyao/eidos/tree/cli-v0.36.6/skills/eidos --skill eidos -g -a codex -y
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

The installers select v0.36.6 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.
