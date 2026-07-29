# Eidos Lite install, upgrade, and rollback runbook

This runbook describes the public-release procedure but does not authorize a
release. The current local artifact is unsigned and staging-bound. Production
packaging, signing, notarization, publishing, and update-feed changes require
separate approval and must use the production build gate.

## Invariants

- A Space is an ordinary user-owned folder. Installing, upgrading, rolling
  back, or uninstalling Eidos Lite must not move, copy, rewrite, or delete it.
- Application state belongs under the OS Electron `userData` location. It may
  contain encrypted account state, operation journals, queue metadata, and
  recent-folder references, but never authoritative Space contents.
- One window owns one canonical Space, one resident Graft `RepositorySession`,
  and up to three `.eidos` runtimes. Do not run two app versions against the
  same Space during an upgrade or rollback.
- The `.eidos` association opens the deepest known containing Space and selects
  one file. It does not create a single-file Remote or a second repository.

## Pre-install and pre-upgrade gate

1. Confirm the artifact version, target architecture, `space.eidos.lite` app
   id, compiled service environment, and published checksums. Production must
   report `production`; a staging artifact is never promoted in place.
2. Verify the platform signature/notarization result and both clean-install and
   in-place-upgrade jobs. An unsigned local package is test evidence only.
3. Quit Eidos Lite and wait for all renderer and utility processes to exit. Do
   not replace the application while a checkpoint, Sync, clone, pull, or
   restore is in flight.
4. In the currently installed version, copy the privacy-safe diagnostics and
   record the app/Graft versions and operation state. Create a Local checkpoint
   for important pending work. Sync is optional and must never be a prerequisite
   for preserving Local files.
5. Keep an independently obtained copy of the previously signed installer and
   its checksum. Do not treat an update feed as the only rollback source.

## Install and upgrade

1. Install the signed artifact using the platform-native package. Replace only
   the application binary; do not choose any Space folder as an install target.
2. Launch the app without a file argument. Confirm the Welcome screen,
   environment badge for non-production builds, and the expected version in
   **Copy diagnostics**.
3. Open a representative existing Space. Confirm Explorer count, one active
   editor, Local checkpoint status, History, and a clean operation phase.
4. Open a root and nested `.eidos` file from the OS shell. Confirm that the
   existing canonical Space window is focused, its ancestor folders expand,
   the file is selected, and no repository-busy error appears.
5. If the Space is connected, run Sync only with a disposable staging account
   during staging acceptance. Production Sync is a separately authorized
   release gate.

Platform acceptance must cover macOS arm64/x64, Windows x64, and Linux
arm64/x64 GNU. The current repository packages macOS arm64 locally; the other
targets require their CI runners and real installers.

## Rollback

1. Quit the new version and wait for every utility process to exit.
2. Preserve the current ordinary Spaces exactly as they are. Never restore a
   Space by replacing its `.graft` directory, copying an old `userData`
   directory, or downgrading SQLite files.
3. Install the previous signed artifact whose checksum was recorded before the
   upgrade. Keep the same release environment.
4. Open a representative Space read-only in intent: inspect Explorer,
   diagnostics, Changes, and History before performing a new mutation or Sync.
5. If the previous version reports a Graft/protocol mismatch or cannot safely
   validate the current worktree, stop. Continue Local work with the compatible
   version or reinstall the newer build; do not force a repository downgrade.
6. Recover historical user data only through Eidos Lite History or the explicit
   Local/Hosted recovery-copy flows. Binary rollback is not data rollback.

## Diagnostics and support handoff

Use **Copy diagnostics** from Welcome or the Space titlebar. The generated JSON
contains app/platform/Electron versions, the compiled environment name,
operation phase, Graft backend/version flags, `.eidos` count, and runtime counts.
It deliberately excludes credentials, tokens, service/Remote URLs, absolute
paths, Space names, repository identifiers, file contents, and row data.

Do not send raw `userData`, OS credential-store records, `.graft`, `.eidos`, or
Space folders as a routine support bundle. If deeper logs are needed, reproduce
with a disposable staging Space and review every file manually before sharing.

## Uninstall

Uninstalling the application must leave all ordinary Space folders untouched.
Removing `userData` is a separate explicit user action: it signs the device out,
removes recent-folder references and pending queue metadata, and may discard
recovery journals. Never advertise it as a general troubleshooting step while
an operation is failed or recoverable.

## Public-release blockers

Before public v1, record successful signed installer install/upgrade/rollback
evidence for every supported target, remote Apple Silicon and Intel packaged
gates, signing/notarization, update-feed signature verification, and rollback
from the update channel. The current repository does not configure or publish
an auto-update feed, so signed automatic updates remain an explicit release
blocker rather than an implied capability.
