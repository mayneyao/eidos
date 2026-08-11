## What's new

### Images from URL fields in Serve

Set a URL field's **Display** property to **Image** to render its HTTPS values
as lazy-loaded thumbnails in Grid and as Gallery covers. Decoded images stay
cached while rows leave and re-enter the viewport, so scrolling no longer
downloads the same image repeatedly. Ordinary URL cells are visibly underlined
and open directly without first entering edit mode.

Remote images are fetched through the Serve host with HTTPS-only validation,
redirect and response-size limits, and private-network blocking. A large CSV
can therefore keep its existing URL column; it does not need to convert every
value into a File field or download image metadata during import.

### Remote files and mounted attachments

File fields can now attach an HTTPS address directly from the cell editor or
record inspector. Remote images receive the same thumbnail and preview
behavior as local attachments, while other remote files can be opened or
downloaded through the host.

Relative `assets/...` entries still require an explicit assets directory. This
complete example creates the file and initial table before starting Serve:

```sh
mkdir eidos-media && cd eidos-media
eidos create media.eidos \
  --table Artwork \
  --label-field Title \
  --fields '[{"name":"Title","type":"text"},{"name":"Image URL","type":"url"},{"name":"Files","type":"file"}]'
mkdir assets
eidos serve media.eidos --assets-dir ./assets --open
```

HTTPS URL images and remote File entries do not require `--assets-dir`; the
mount is only for relative attachments and uploads stored beneath `assets/`.

### Version-matched Eidos Skill for Codex

Install the Eidos Skill from this immutable CLI tag to keep the safe
`context` → `apply` → `validate` workflow aligned with the release:

```sh
npx skills add https://github.com/mayneyao/eidos/tree/cli-v0.36.8/skills/eidos --skill eidos -g -a codex -y
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

The installers select v0.36.8 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.
