# Eidos Lite release

Use this runbook for `apps/eidos-lite-desktop` and `lite-v*` tags.

## Establish the contract

- `apps/eidos-lite-desktop/package.json` owns the committed base version.
- Tags use `lite-v<base>` for stable releases or
  `lite-v<base>-<alpha|beta|rc>.<number>` for prereleases.
- The tag triggers `.github/workflows/build-and-release-eidos-lite.yml`.
- The workflow builds macOS arm64/x64, Windows x64, and Linux arm64/x64.
- `apps/download` routes stable and beta updater metadata independently by
  platform and architecture.
- A bundled Graft update changes the Lite dependency and lockfile; it does not
  modify a sibling Graft repository or publish Graft itself.

Before changing the version, read
`apps/eidos-lite-desktop/docs/RELEASE-RUNBOOK.md` and
`apps/eidos-lite-desktop/docs/OPERATIONS.md` completely.

## Prepare and validate

Require a clean worktree for version preparation. Update the exact base version
in `apps/eidos-lite-desktop/package.json`, refresh `pnpm-lock.yaml`, and commit
the preparation coherently.

Run the focused gates:

```bash
pnpm install --frozen-lockfile
pnpm --filter @eidos.space/eidos-file test:node-sqlite
pnpm --filter @eidos.space/eidos-lite-desktop typecheck
pnpm test:eidos-lite
pnpm test:eidos-lite:performance
node --test apps/download/src/release-routing.test.mjs
pnpm --filter @eidos.space/eidos-lite-desktop build:release
pnpm build:eidos-lite:dev
pnpm smoke:eidos-lite-packaged
git diff --check
```

When Graft changes, also run the real Graft integration suite and inspect the
resolved dependency in the lockfile. Do not substitute mocked transport tests
for the real SDK gate.

## Tag and monitor

Require the version commit on the intended remote and prove the tag is absent,
then create one lightweight tag:

```bash
git tag lite-v<version>
git push origin <branch> lite-v<version>
gh run list --workflow build-and-release-eidos-lite.yml --limit 10
gh run watch <run-id> --exit-status
```

Do not manually create a duplicate GitHub Release. The workflow verifies the
tag/base-version contract, builds signed and notarized macOS packages plus
explicitly unsigned Windows/Linux packages, deploys the update router,
normalizes update metadata, writes `SHA256SUMS`, and publishes the Release.

## Prove publication

Verify:

- remote tag and exact workflow SHA;
- successful release and update-router jobs;
- macOS arm64/x64 DMG and ZIP assets;
- Windows x64 EXE plus blockmap;
- Linux arm64/x64 AppImage assets plus blockmaps;
- channel-specific metadata for all five targets and `SHA256SUMS`;
- stable/prerelease classification;
- a downloaded checksum and packaged launch smoke;
- the relevant `download.eidos.space/lite/updates/...` route.

Report the exact tag, commit, workflow and Release URLs, platform coverage,
update-route evidence, validation, and branch/worktree state.
