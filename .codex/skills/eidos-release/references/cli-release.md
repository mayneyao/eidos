# Standalone Eidos CLI release

Use this runbook for the Rust CLI in `apps/cli`. A CLI release is independent
from Eidos Lite, Eidos File Web, and Eidos Publish.

## Establish the release contract

- `apps/cli/Cargo.toml` is the CLI version source of truth.
- `apps/cli/Cargo.lock` must contain the same `eidos` package version.
- Stable releases update `apps/cli/LATEST`; prereleases do not move it.
- `apps/cli/RELEASE_NOTES.md` is the exact body for one standalone CLI version.
  It is a single-release manifest, not a cumulative changelog. Replace it for
  every version; do not use GitHub's monorepo-generated release notes.
- Release examples must be complete, runnable workflows that include their
  prerequisites. A Serve example must create a `.eidos` file and its initial
  table before running `eidos serve`; do not assume an existing input file.
- Tags use `cli-v<semver>` and trigger
  `.github/workflows/build-and-release-cli.yml` only.
- Eidos Lite version bumps never rewrite the CLI version.
- CLI Releases set `make_latest: false` so they do not replace the repository's
  Eidos Lite Latest Release pointer.
- the CLI embeds the committed QuickJS Runtime in `qjs-host/bundle` and Serve UI
  in `qjs-host/ui`. The same source and generated UI are also inputs to the
  Publish Container, and Lite builds the CLI as its bundled Publish engine.
  Releasing the CLI does not deploy Publish or release Lite; assess both
  independently when the changed CLI path affects them.
- `https://download.eidos.space/cli/install.sh`, `/cli/install.ps1`, and
  `/cli/latest` are served by `apps/download`. CLI tags never participate in
  Lite installer or update selection.

Expected release assets are:

- `eidos-cli-v<version>-aarch64-apple-darwin.tar.gz`
- `eidos-cli-v<version>-x86_64-apple-darwin.tar.gz`
- `eidos-cli-v<version>-x86_64-unknown-linux-gnu.tar.gz`
- `eidos-cli-v<version>-x86_64-pc-windows-msvc.zip`
- `eidos-installer.sh`
- `eidos-installer.ps1`
- `SHA256SUMS`

## Prepare the version

Require a clean worktree before release preparation. Update the package version
in `apps/cli/Cargo.toml`, then refresh and inspect the lockfile:

```bash
cd apps/cli
cargo check --workspace
git diff -- Cargo.toml Cargo.lock
```

Before the version commit, refresh committed generated inputs when their source
changed:

```bash
pnpm --filter @eidos.space/eidos-file build:quickjs
pnpm --filter @eidos.space/eidos-file-serve build
git diff -- apps/cli/qjs-host/bundle apps/cli/qjs-host/ui
```

Reject stale or unrelated generated churn. The generated diff is delivery
evidence, not a separate release-note feature.

For a stable version, write the exact version without a `v` prefix to
`apps/cli/LATEST`. Rewrite `apps/cli/RELEASE_NOTES.md` for the exact version and
CLI-only behavior. Leave `LATEST` on the previous stable version for beta,
alpha, or rc tags. Apply the shared release-notes policy: keep only this
version's CLI delta under `## What's new`, and keep repeatable install and Skill
instructions in separate level-two operational sections.

Commit the version preparation coherently. Before tagging, require the branch
commit to exist on the intended remote and verify that neither the local nor
remote tag exists.

## Validate before tagging

Run:

```bash
cd apps/cli
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cd ../..
node --test apps/cli/install.test.mjs apps/cli/release.test.mjs apps/download/src/release-routing.test.mjs
node .codex/skills/eidos-release/scripts/audit-release-notes.mjs \
  --surface cli \
  --tag cli-v<version>
pnpm --filter download typecheck
pnpm --filter download exec wrangler deploy --dry-run
git diff --check
```

Also inspect `install.sh`, `install.ps1`, the workflow matrix, archive names,
checksum verification, `RELEASE_NOTES.md`, and the branded download routes
whenever the release surface changes. The notes MUST describe only standalone
CLI changes, document initialization from the Skill bundled in that exact CLI
version, and pass comparison with the previous three stable or previous three
prerelease CLI bodies. Before the first CLI Release—or after changing those
public routes—deploy `apps/download` separately and verify all three branded
URLs.

## Tag and monitor

Create one lightweight tag on the validated commit:

```bash
git tag cli-v<version>
git push origin <branch> cli-v<version>
gh run list --workflow build-and-release-cli.yml --limit 10
gh run watch <run-id> --exit-status
```

Do not create a GitHub Release manually. The workflow verifies the tag against
Cargo metadata, requires `LATEST` for stable tags, builds every matrix target,
checks each binary version, audits the single-release notes, creates the
checksum manifest, and publishes the Release with the committed body in the
same operation.

Use the main skill's empty failed-tag recovery rules. Never move a CLI tag that
has a Release, uploaded asset, or plausible consumer.

## Prove publication

Verify the remote tag, exact workflow SHA, GitHub Release, all seven assets,
and checksums:

```bash
git ls-remote origin refs/tags/cli-v<version>
gh run view <run-id> --json status,conclusion,headSha,url
gh release view cli-v<version> --json url,isDraft,isPrerelease,publishedAt,assets,body
```

Fetch the published body through the API and byte-compare it with
`apps/cli/RELEASE_NOTES.md` at the release tag. Require the workflow's own
exact-body verification step to be green; browser rendering alone is not proof.

Download `SHA256SUMS` and at least the current-platform archive into a temporary
directory. Verify the archive checksum independently, extract it, and require
`eidos --version` to report the released version. For a stable release, run the
public installer command into a temporary `EIDOS_INSTALL_DIR` and verify the
installed binary.

Report the tag and commit, workflow and Release URLs, seven-asset platform
coverage, checksum/install smoke results, current `LATEST`, and branch/upstream
state.
