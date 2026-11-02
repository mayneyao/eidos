# Unpublished Lite candidate acceptance

Runtime source: `5038d986a16d3470ba5e8422bf2616f3086326d6`, isolated from public
Lite `0.29.7`. This branch only adds verification/workflow files and portable
offline dependency inputs. The normal release guard and platform builder
configurations remain unchanged.

All six private package inputs come from Graft CI run `41528970965`, source
`7939073a1cc3439086343bac5ba74342fbfea9b8`. Their SHA-256 values and native hashes
are fixed in `vendor/graft-candidate/packages-manifest.json`. The earlier local
builds share the version but have different native hashes and are not consumed
here. Both SDK runtime path overrides must remain unset.

`prepare-candidate.mjs` validates the complete cohort and actual archive payloads
before any package is installed. A frozen lockfile is committed. Pnpm 12's
generated importer specifiers normalized the six workspace file overrides
relative to the importer; its frozen check compares the raw root overrides.
Those six display specifiers were aligned with the root overrides after
generation, without changing dependency resolutions or integrity fields. The
exact frozen install was then tested locally.

The existing registered `.github/workflows/eidos-lite-desktop-gates.yml` is
replaced only on this dedicated branch. It accepts manual dispatch only, checks
the branch name, uses read-only GitHub permissions, and runs five native targets
with at most two jobs concurrently. Nothing triggers on branch push. No tag,
Release, npm publication, notarization, deployment or update-routing job exists.

`candidate-driver.mjs build` invokes the normal prepare/build scripts followed by
electron-builder with `--publish never`. Updates are disabled in the production
address build mode. macOS retains Developer ID/hardened runtime, explicitly
without notarization; Windows follows the existing unsigned policy. A proper
published-registry release is still blocked by the unmodified release guard.

`accept` changes only disposable runner OS registrations and synthetic test
profiles. It installs public 0.29.7, upgrades, rolls back and reinstalls. Existing
packaged smoke verifies signed fixture certificates locally without activation,
then deletes the temporary certificate/profile. Installed SDK fixtures contact
only loopback servers with synthetic credentials; they receive no real account
certificate or token. No production activation, device change or network Sync
write is performed by this acceptance.

Uploaded paths are limited to evidence, installers and release-notes screenshots.
Temporary profiles/keychains/certificates are not artifacts. An always-run
privacy check blocks evidence upload if a supplied credential/certificate value
or a private key marker appears. Performance measurements are observations.

Linux also builds the normal AppImage, extracts it using the image's own runtime,
then exercises AppRun with full packaged smoke and normal Chromium sandbox.
Extraction/AppRun startup is recorded separately from FUSE mounting. Mac builds
both DMG and ZIP. Static metadata checks use the actual builder YAML and verify
artifact length/SHA-512, AppImage embedded blockmaps and the existing beta route
mapping. Only local evidence is written; production update routing is unchanged.
