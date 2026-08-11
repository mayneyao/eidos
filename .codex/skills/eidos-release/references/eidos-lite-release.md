# Eidos Lite release

Use this runbook for `apps/eidos-lite-desktop` and `lite-v*` tags.

## Establish the contract

- `apps/eidos-lite-desktop/package.json` owns the committed base version.
- Tags use `lite-v<base>` for stable releases or
  `lite-v<base>-<alpha|beta|rc>.<number>` for prereleases.
- The tag triggers `.github/workflows/build-and-release-eidos-lite.yml`.
- `apps/eidos-lite-desktop/RELEASE_NOTES.md` is the exact final GitHub Release
  body. Create it for the first release after this contract and rewrite it for
  every later Lite version.
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
in `apps/eidos-lite-desktop/package.json`, refresh `pnpm-lock.yaml`, rewrite the
Lite release notes, and commit the preparation coherently.

## Write What's new

Write the notes before tagging. Derive them from the previous Lite tag, not the
repository's latest GitHub Release, because CLI and Lite use independent tag
namespaces:

```bash
git tag --list 'lite-v*' --sort=-v:refname | head -10
git log --oneline <previous-lite-tag>..HEAD -- \
  apps/eidos-lite-desktop apps/download packages/eidos-file packages/eidos-file-ui pnpm-lock.yaml
git diff --stat <previous-lite-tag>..HEAD -- \
  apps/eidos-lite-desktop apps/download packages/eidos-file packages/eidos-file-ui pnpm-lock.yaml
```

Rewrite `apps/eidos-lite-desktop/RELEASE_NOTES.md` as concise user-facing
Markdown with this required opening:

```markdown
## What's new

### <user-visible improvement>

<What changed, why it matters, and any action the user needs to take.>
```

Add further improvement or fix sections only when supported by the scoped diff.
For a maintenance release, describe the concrete reliability or compatibility
fix; never publish an empty `What's new` section or say only "bug fixes and
improvements." Do not fill the notes with commit subjects, signing policy,
internal package versions, or unrelated CLI/Web changes. Mention a migration,
limitation, or access requirement only when it affects users of this release.

Before tagging, require a substantive body:

```bash
test -s apps/eidos-lite-desktop/RELEASE_NOTES.md
rg -n "^## What's new$" apps/eidos-lite-desktop/RELEASE_NOTES.md
git diff --check -- apps/eidos-lite-desktop/RELEASE_NOTES.md
```

Read the complete file and compare every claim with the scoped diff and test
evidence. Treat missing, generic, stale-version, or unsupported notes as a
release blocker.

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
After the workflow has created that Release, replace its generated body with
the committed curated notes before considering publication complete:

```bash
gh release edit lite-v<version> \
  --notes-file apps/eidos-lite-desktop/RELEASE_NOTES.md
```

## Prove publication

Verify:

- remote tag and exact workflow SHA;
- successful release and update-router jobs;
- macOS arm64/x64 DMG and ZIP assets;
- Windows x64 EXE plus blockmap;
- Linux arm64/x64 AppImage assets plus blockmaps;
- channel-specific metadata for all five targets and `SHA256SUMS`;
- stable/prerelease classification;
- a non-empty GitHub Release body that matches the committed
  `apps/eidos-lite-desktop/RELEASE_NOTES.md`;
- a downloaded checksum and packaged launch smoke;
- the relevant `download.eidos.space/lite/updates/...` route.

Fetch the published body and compare it with the committed source. Do not rely
on the browser rendering alone:

```bash
notes_copy="$(mktemp)"
gh release view lite-v<version> --json body --jq -r '.body' > "$notes_copy"
diff -u apps/eidos-lite-desktop/RELEASE_NOTES.md "$notes_copy"
```

Report the exact tag, commit, workflow and Release URLs, the `What's new`
headings, platform coverage, update-route evidence, validation, and
branch/worktree state.
