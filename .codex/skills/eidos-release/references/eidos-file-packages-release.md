# Eidos File packages release

Use this procedure for the public npm packages
`@eidos.space/eidos-file` and `@eidos.space/eidos-file-ui`.
`packages/eidos-file-serve` is private and is never published.

## Publisher and version contract

- The two public packages are one versioned cohort. Their committed versions
  must match, and the UI tarball must depend on the same Runtime version with a
  caret range.
- Tags use `eidos-file-packages-v<semver>`.
- Publication is owned only by
  `.github/workflows/publish-eidos-file-packages.yml`.
- Never run `npm publish` locally and never obtain a local npm token for this
  release. The workflow uses npm Trusted Publishing through GitHub OIDC and
  requests only a short-lived token.
- A package release does not imply a Lite, CLI, Web, Publish, or GitHub Release.
  Shared package changes may create downstream candidates, but prepare and prove
  those surfaces independently when requested. Use
  [release-impact.md](release-impact.md) to trace source into each consumer.

The npm package settings must name `mayneyao/eidos` and
`publish-eidos-file-packages.yml` as the trusted publisher for both packages.
Do not add a long-lived `NPM_TOKEN` secret as a fallback. If OIDC authorization
fails, stop and repair the trusted-publisher configuration instead of publishing
from a workstation.

## Decide whether the cohort needs a release

Compare the published tarballs and the source diff since their release commit.
Publish the cohort when Runtime behavior or public types changed, UI behavior or
public types changed, or a package artifact/metadata fix is required. Do not bump
the packages for Lite-only chrome, Sync, CLI, Web-host, documentation-only, or
private `eidos-file-serve` changes.

Before preparing a version, prove the current registry state:

```bash
npm view @eidos.space/eidos-file version dist.integrity --json
npm view @eidos.space/eidos-file-ui version dependencies dist.integrity --json
```

## Prepare and plan

Update both package versions and regenerate any changed API reports. Run the
package tests and `prepublishOnly` gates locally, inspect both tarballs, and
verify that the UI tarball contains the resolved dependency
`@eidos.space/eidos-file: ^<version>` rather than a workspace protocol.

Commit and push the preparation before invoking Actions. Then run a plan from
the pushed branch and monitor its exact run:

```bash
gh workflow run publish-eidos-file-packages.yml \
  --ref dev \
  -f version=<version> \
  -f mode=plan
gh run list --workflow publish-eidos-file-packages.yml --limit 10
gh run watch <run-id> --exit-status
```

The plan must upload exactly two reviewed tarballs plus `SHA256SUMS`. Download
that exact run's artifact before tagging; confirm that it contains only those
three files, verify the checksums from inside the artifact directory, and
inspect both packed `package.json` files again:

```bash
artifact_dir="$(mktemp -d)"
gh run download <run-id> \
  -n eidos-file-packages-<version> \
  -D "$artifact_dir"
find "$artifact_dir" -maxdepth 1 -type f -print
(cd "$artifact_dir" && sha256sum --check SHA256SUMS)
tar -xOf "$artifact_dir/eidos.space-eidos-file-<version>.tgz" \
  package/package.json
tar -xOf "$artifact_dir/eidos.space-eidos-file-ui-<version>.tgz" \
  package/package.json
```

Do not tag or publish after a failed plan or artifact audit.

## Publish from an immutable tag

After the plan passes, verify the branch is still clean, pushed, and at the
planned commit. Confirm that the local and remote tag do not exist. Create a
lightweight tag and push it without moving any existing tag:

```bash
git tag eidos-file-packages-v<version>
git push origin refs/tags/eidos-file-packages-v<version>
```

Dispatch publication from that exact tag, never from a branch:

```bash
gh workflow run publish-eidos-file-packages.yml \
  --ref eidos-file-packages-v<version> \
  -f version=<version> \
  -f mode=publish
gh run list --workflow publish-eidos-file-packages.yml --limit 10
gh run watch <run-id> --exit-status
```

The workflow rebuilds and rechecks the plan on the tag, publishes UI first,
waits for it to become readable from npm, and then publishes Runtime. UI is the
less frequently exercised Trusted Publisher, while Runtime is already proven;
this order avoids leaving a new Runtime-only cohort when UI authorization is
incomplete. It publishes
the reviewed tarballs with provenance; it does not rebuild between review and
registry writes. Paths passed to `npm publish` must be explicitly relative
(`./package-release/<tarball>.tgz`); without the `./` prefix, npm can interpret
the tarball path as a Git dependency instead of a local package archive.

The workflow is retry-safe across partial cohort publication. Before skipping
an already-published package, it must compare npm's `dist.shasum` with the exact
reviewed tarball and stop on any mismatch. This permits a failed UI publication
to resume without attempting to overwrite an immutable Runtime version.

When verifying the UI package's scoped Runtime dependency, read the complete
`dependencies` object as JSON and select `@eidos.space/eidos-file` with `jq`.
Do not pass `dependencies.@eidos.space/eidos-file` as an npm field selector:
npm parses the scoped package name as path segments and returns an empty value.

If a publication workflow fails after an immutable package tag is pushed but
before either package reaches npm, keep that tag in place, fix the workflow,
bump both packages to the next patch version, and repeat plan, artifact review,
tag, and publish. Never move or replace the failed tag.

If an older, non-retry-safe workflow publishes only part of the cohort, repair
the workflow and trusted-publisher configuration, then bump the complete cohort
to the next patch version. Treat the partial version as immutable registry
history; never overwrite it or publish a newly built counterpart by hand.

## Prove the public result

Do not claim success from a green workflow alone. Verify both immutable versions,
their integrity/provenance metadata, and the UI dependency:

```bash
npm view @eidos.space/eidos-file@<version> \
  version dist.integrity dist.attestations --json
npm view @eidos.space/eidos-file-ui@<version> \
  version dependencies.@eidos.space/eidos-file dist.integrity dist.attestations --json
git ls-remote --tags origin refs/tags/eidos-file-packages-v<version>
```

Report the tag and commit, workflow run URL, both registry versions and
integrities, UI dependency, provenance evidence, test/pack gates, and final
branch/worktree state.
