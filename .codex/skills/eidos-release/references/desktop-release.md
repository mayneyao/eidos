# Desktop and Graft Release Runbook

Use this runbook for Eidos Desktop beta/stable releases and bundled Graft runtime upgrades.

## Contents

- [Current delivery boundaries](#current-delivery-boundaries)
- [Integrate the latest official Graft release](#integrate-the-latest-official-graft-release)
- [Validate the Graft integration](#validate-the-graft-integration)
- [Preserve the Windows smoke termination contract](#preserve-the-windows-smoke-termination-contract)
- [Run pre-tag Desktop gates](#run-pre-tag-desktop-gates)
- [Publish and monitor the Desktop tag](#publish-and-monitor-the-desktop-tag)
- [Diagnose a failed tag run](#diagnose-a-failed-tag-run)
- [Record upstream limitations accurately](#record-upstream-limitations-accurately)

## Current delivery boundaries

Inspect these sources before changing pins or claiming coverage:

- `.github/workflows/build-and-release-desktop-app.yml`: `v*` tag trigger, extension-delivery gate, frontend/runtime smoke, four platform builds, and GitHub Release creation.
- `.github/workflows/graft-versioning-smoke.yml`: Windows Graft conformance.
- `apps/desktop/graft-runtime-manifest.json`: official repository, tag, release commit, SHA256SUMS checksum, twelve archive checksums, and twelve extracted binary checksums.
- `apps/desktop/scripts/graft-runtime-installer.cjs`: download, cache, extraction, and checksum enforcement.
- `apps/desktop/scripts/graft-runtime-installer.test.ts`: manifest and installer contract.
- `apps/desktop/electron/modules/space-versioning/graft-runtime-version.test.ts`: runtime version contract.
- `apps/desktop/scripts/graft-versioning-smoke.cjs`: CLI, SQLite VFS, branches, merge, reset, restore, multi-database, and remote-conflict conformance.
- `apps/desktop/scripts/eidos-file-versioning-smoke.mjs`: Eidos File data and Graft restore integration.

Use `rg` with the old version before editing. Update every intentional version pin, assertion, and version-specific degradation message; do not blindly replace unrelated dependency versions.

## Integrate the latest official Graft release

Resolve the latest release from the official repository, not a local checkout:

```bash
gh release view --repo eidos-space/graft --json tagName,publishedAt,url,assets
gh api repos/eidos-space/graft/commits/<tag> --jq '.sha'
```

Inspect the asset list and `SHA256SUMS`. Require all CLI and SQLite-extension archives needed by the manifest:

- macOS arm64 and x64
- Linux arm64 and x64
- Windows arm64 and x64
- one CLI archive and one SQLite-extension archive per target

Update `apps/desktop/graft-runtime-manifest.json` with:

- exact tag and semantic version;
- exact release commit SHA;
- SHA-256 of the downloaded `SHA256SUMS` asset;
- archive name and SHA-256 for all twelve archives;
- extracted CLI/library source name, installed name, and SHA-256 for all twelve binaries.

Download into a task-specific temporary directory. Verify each archive against the official `SHA256SUMS`, extract it, and compute the binary hash independently. Never trust filenames or a copied manifest without hashing the bytes.

Update both workflow pins:

- `GRAFT_RELEASE_VERSION` in `.github/workflows/build-and-release-desktop-app.yml`
- `GRAFT_RELEASE_VERSION` in `.github/workflows/graft-versioning-smoke.yml`

Update installer/version tests and any explicit version-specific behavior assertions. Preserve a documented upstream degradation as an assertion when Eidos safely supports it; do not disguise it as full support.

## Validate the Graft integration

Stop any workspace-owned Desktop development process. Run Node-side checks and Electron/Desktop checks serially.

Install the pinned runtime for the current platform; the installer must validate both archive and extracted binary hashes:

```bash
cd apps/desktop
node scripts/postinstall-sqlite-ext.cjs
```

Run the installer and version contract tests:

```bash
pnpm exec vitest run apps/desktop/scripts/graft-runtime-installer.test.ts apps/desktop/electron/modules/space-versioning/graft-runtime-version.test.ts --environment node
```

Run the full Graft smoke under Electron's Node ABI using the executable directly:

```bash
cd apps/desktop
eidos_electron_bin=$(node -p 'require("electron")')
ELECTRON_RUN_AS_NODE=1 "$eidos_electron_bin" scripts/graft-versioning-smoke.cjs
```

Also run:

```bash
pnpm --filter eidos smoke:graft-worker
pnpm --filter eidos smoke:eidos-file-versioning
```

Verify the installed CLI version and current-platform binary checksums against the manifest. Build and inspect an unpacked Desktop package with `pnpm build:desktop:dev` after tests have completed.

## Preserve the Windows smoke termination contract

The Windows workflow must:

- set `timeout-minutes` on the smoke step;
- set `ELECTRON_RUN_AS_NODE=1`;
- resolve Electron with `node -p "require('electron')"` and invoke the executable directly from PowerShell, avoiding the `pnpm exec electron` `.cmd` wrapper;
- let `graft-versioning-smoke.cjs` close databases and temporary resources before its final forced process exit.

If logs show every scenario passed but the step remains running, classify it as a failing harness, not a pass. Fix process termination and obtain a green Windows workflow.

Transient Windows `ENOTEMPTY` cleanup warnings can result from native VFS handles. They are not a functional pass/fail signal by themselves; the test assertions, process exit, and runner result remain authoritative.

## Run pre-tag Desktop gates

Mirror the reusable Extension Delivery workflow because the Desktop release depends on it:

```bash
pnpm check:extension-packages
pnpm --filter "@eidos.space/extension-cli" typecheck
pnpm --filter "@eidos.space/extension-cli" test
pnpm test:extension-release
pnpm smoke:extension-tooling
pnpm --filter docs build
```

Then run relevant Desktop runtime smoke, type checks, and `pnpm build:desktop:dev`. In Linux CI, keep the Electron sandbox enabled and configure `chrome-sandbox` ownership/mode before the Xvfb runtime smoke; do not disable the sandbox to make CI pass.

Use exact public API names in runtime fixtures. For example, if SDK/templates expose `eidosFile`, the Desktop host must pass `eidosFile`, not an internal alias.

## Publish and monitor the Desktop tag

The release workflow derives the build version from the complete tag. A tag such as `v0.34.0-beta.2` builds `0.34.0-beta.2` artifacts even though the committed base version is `0.34.0`.

The tag channel contract is:

- tags containing `-beta`, `-alpha`, or `-rc`: GitHub prerelease and beta updater metadata;
- stable tags: non-prerelease and latest updater metadata, plus beta metadata so beta-channel users can upgrade to stable.

Monitor every dependency in the workflow: Extension Delivery, frontend build and runtime smoke, Windows, Linux, macOS arm64, macOS x64, and final Release creation.

For the current four-platform beta contract, expect nine uploaded Release assets:

- `beta.yml`
- `beta-linux.yml`
- `beta-mac.yml`
- Windows x64 `.exe`
- Linux x86_64 `.AppImage`
- macOS arm64 `.dmg` and `.zip`
- macOS x64 `.dmg` and `.zip`

Re-read the workflow if its matrix changes; derive the expected asset set from the checked-in workflow rather than preserving an obsolete count.

## Diagnose a failed tag run

Inspect the exact failing job and logs before changing code:

```bash
gh run view <run-id> --json status,conclusion,headSha,url,jobs
gh run view <run-id> --job <job-id> --log
```

Common release-blocker classes include:

- PowerShell interpreting unquoted scoped pnpm filters;
- packed tooling accidentally resolving workspace binaries instead of the tarball-installed CLI;
- Windows symlink/reparse-point validation differences;
- Linux Electron sandbox ownership or mode;
- Desktop host/runtime public API name mismatches;
- Electron/Windows smoke processes completing assertions but not terminating.

Fix the cause, add or strengthen a regression check, validate locally, and push a cohesive repair. Use the failed-tag recovery rules in the main skill only when the failed attempt produced neither artifacts nor a GitHub Release.

## Record upstream limitations accurately

When an official Graft release has a confirmed limitation, keep the behavior explicit in conformance and release reporting. For example, Graft may support opaque snapshot/version/restore for an Eidos File while lacking logical row diff for a SQLite surface such as `WITHOUT ROWID`.

State exactly which operation degrades and which operations remain verified. Do not weaken Eidos File format requirements or claim logical diff support that the bundled Graft version does not provide.
