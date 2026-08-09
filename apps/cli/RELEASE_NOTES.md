## What's new

### Create a table, then open it securely from any device

Start by creating an Eidos File with a `Tasks` table:

```sh
eidos create tracker.eidos \
  --table Tasks \
  --label-field Title \
  --fields '[{"name":"Title","type":"text"},{"name":"Status","type":"select"}]'
```

Sign in once, verify the reusable CLI session, and publish the embedded editor
through Eidos Relay:

```sh
eidos login
eidos whoami
eidos serve tracker.eidos --relay --open
```

`eidos login` uses Authorization Code + PKCE and stores the renewable session
in an owner-only user configuration file. Later Relay commands silently reuse
or refresh it without a macOS Keychain or other operating-system credential
prompt.

The account receives a stable opaque `u-….eidos.ink` hostname. By default, the
printed URL contains no access key: every browser signs in through eidos.space,
and only the account that started the Relay can open the editor. The CLI keeps
the file and Runtime on the local machine and connects through one outbound
WebSocket.

Create a guest link explicitly when another person should be able to edit
without the owner's Eidos account:

```sh
eidos serve tracker.eidos --relay --share
```

The `--share` URL contains a fragment-only access key. Treat it like a
credential and share it only with intended collaborators.

### Faster row creation over Relay

Adding a row in the embedded editor is now optimistic. The new row appears and
accepts edits immediately while the Runtime mutation completes in the
background, so Relay latency no longer blocks the appended-row editor. The UI
reconciles the temporary Row ID with the committed Row ID and removes the
placeholder if creation fails.

Other browsers still receive committed revisions from the single authoritative
Runtime writer. This preserves serialized file mutations while making the
initiating browser feel immediate.

### Version-matched Eidos Skill for Codex

Install the Eidos Skill from this immutable CLI tag to keep the safe
`context` → `apply` → `validate` workflow aligned with the release:

```sh
npx skills add https://github.com/mayneyao/eidos/tree/cli-v0.36.5/skills/eidos --skill eidos -g -a codex -y
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

The installers select v0.36.5 and verify the downloaded archive against the
release `SHA256SUMS` before replacing an existing binary.
