# Eidos Lite release

Use this runbook for `apps/eidos-lite-desktop` and `lite-v*` tags.

## Establish the contract

- `apps/eidos-lite-desktop/package.json` owns the committed base version.
- Tags use `lite-v<base>` for stable releases or
  `lite-v<base>-<alpha|beta|rc>.<number>` for prereleases.
- The tag triggers `.github/workflows/build-and-release-eidos-lite.yml`.
- `apps/eidos-lite-desktop/RELEASE_NOTES.md` is the exact body for one Lite
  version. It is a single-release manifest, not a cumulative changelog.
- `apps/eidos-lite-desktop/RELEASE_NOTES.zh-CN.md` is its Simplified Chinese
  translation. Both are bundled offline for What's New and must be prepared
  and committed together. The app defaults to its resolved interface language
  and offers a document-local Chinese/English switch.
- The workflow audits that manifest and uses it when the GitHub Release is first
  created. GitHub-generated monorepo notes and post-publication body repair are
  forbidden.
- The workflow builds macOS arm64/x64, Windows x64, and Linux arm64/x64
  AppImage plus Debian packages.
- `apps/download` routes stable and beta updater metadata independently by
  platform and architecture.
- Lite packaging builds the current `apps/cli` workspace per platform and
  bundles the resulting `eidos` binary as its Publish engine. It does not
  download a standalone CLI Release. CLI Publish/Collect/Runtime changes may
  therefore require a Lite release even when the Lite renderer is unchanged;
  unrelated CLI commands and docs do not.
- A bundled Graft update changes the Lite dependency and lockfile; it does not
  modify a sibling Graft repository or publish Graft itself.

Before changing the version, read
`apps/eidos-lite-desktop/docs/RELEASE-RUNBOOK.md` and
`apps/eidos-lite-desktop/docs/OPERATIONS.md` completely.

## Prepare and validate

Require a clean worktree for version preparation. Update the exact base version
in `apps/eidos-lite-desktop/package.json`, refresh `pnpm-lock.yaml`, rewrite the
Lite release notes, and commit the preparation coherently.

## Prepare release notes

Write the notes before tagging. Derive them from the previous Lite tag, not the
repository's latest GitHub Release, because CLI and Lite use independent tag
namespaces. Apply the shared release-notes policy and replace the previous
manifest completely.

Extract the evidence-backed version delta using the preparation tool:

```bash
node .codex/skills/eidos-release/scripts/prepare-release-notes.mjs \
  --surface lite
```

The script performs the factual analysis and noise filtering:

- Resolves the previous Lite baseline tag;
- Identifies new features and clusters related commits;
- Absorbs iterative development fixes for those new features so they do not pollute `## Bug fixes`;
- Categorizes pre-existing bug fixes into `## Bug fixes` and enhancements into `## Improvements`;
- Filters out internal chores, CI churn, and build configs.

The AI Agent then authors and polishes `apps/eidos-lite-desktop/RELEASE_NOTES.md`
based on the script's evidence dossier, crafting user-centric product copy:

```markdown
## What's new

### <user-visible feature>

<What changed, why it matters, and any action the user needs to take.>

## Improvements

- **<Area>**: <Concise user-visible improvement>

## Bug fixes

- **<Area>**: <Concise bug fix for pre-existing behavior>
```

Translate the finalized English body into
`apps/eidos-lite-desktop/RELEASE_NOTES.zh-CN.md` using `## 新功能`, `## 改进`,
and `## 问题修复` for the corresponding categories. Preserve item order,
capabilities, limitations, and required actions. Translate prose naturally;
keep version numbers, commands, paths, URLs, and product identifiers exact.
Do not add claims or retain previous-release items in either language.

Add further improvement or fix sections only when supported by the scoped diff.
For a maintenance release, describe concrete reliability or compatibility
fixes; never publish an empty section or say only "bug fixes and
improvements." Do not fill the notes with commit subjects, signing policy,
internal package versions, or unrelated CLI/Web changes. Mention a migration,
limitation, or access requirement only when it affects users of this release.
Do not retain a section merely because it is still important: if it shipped in
an earlier Lite tag, it belongs in that historical GitHub Release.

Before tagging, require a substantive body and run the audit:

```bash
test -s apps/eidos-lite-desktop/RELEASE_NOTES.md
test -s apps/eidos-lite-desktop/RELEASE_NOTES.zh-CN.md
git diff --check -- apps/eidos-lite-desktop/RELEASE_NOTES.md apps/eidos-lite-desktop/RELEASE_NOTES.zh-CN.md
node .codex/skills/eidos-release/scripts/audit-release-notes.mjs \
  --surface lite \
  --tag lite-v<version>
```

The audit script checks the English publication body; it does not verify
translation accuracy. Review the two files side by side, checking every item,
category, version reference, link, and migration/access instruction. A missing
or stale Chinese translation is a release blocker even when the script passes.
Preview both languages in the app's read-only Markdown view and exercise the
inline language switch. Confirm that switching notes does not change the app's
language preference. Record these checks with the release proof.

When a prior immutable tag has build artifacts but no GitHub Release, retain the
tag, prepare a new version, and pass that prior tag with `--unpublished-tag`.
The audit verifies the missing Release through `gh`; this is not an exception
for correcting or hiding published notes.

Read the complete file, the previous three Lite Release bodies, and compare
every claim with the scoped diff and test evidence. Treat missing, generic,
stale-version, duplicated, or unsupported notes as a release blocker. The
script detects structural and near-copy duplication; the human review must
also reject semantic restatements.

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

When the bundled CLI Publish engine changed, also run the CLI formatter,
Clippy, workspace tests, and Publish/Collect integration coverage. Include only
outcomes observable through Lite in Lite release notes; the standalone CLI has
its own release history.

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
normalizes update metadata, writes `SHA256SUMS`, audits the notes against recent
Lite tags, and publishes the Release with the committed curated body in the
same operation. Never run `gh release edit` as the normal publication path.

## Prove publication

Verify:

- remote tag and exact workflow SHA;
- successful release and update-router jobs;
- macOS arm64/x64 DMG and ZIP assets plus standalone blockmaps;
- Windows x64 EXE plus a standalone blockmap;
- Linux arm64/x64 AppImage and Debian assets, with both package types present
  in their per-architecture update metadata; AppImages have embedded blockmaps
  whose `blockMapSize` values appear in that metadata;
- channel-specific metadata for all five targets and `SHA256SUMS`;
- stable/prerelease classification;
- a non-empty GitHub Release body that matches the committed
  `apps/eidos-lite-desktop/RELEASE_NOTES.md`;
- workflow proof that the exact-body comparison passed immediately after
  Release creation;
- a downloaded checksum and packaged launch smoke;
- the relevant `download.eidos.space/lite/updates/...` route.

Fetch the published body and compare it with the committed source. Do not rely
on the browser rendering alone:

```bash
notes_copy="$(mktemp)"
gh release view lite-v<version> --json body \
  | jq --join-output '.body' > "$notes_copy"
diff -u apps/eidos-lite-desktop/RELEASE_NOTES.md "$notes_copy"
```

Report the exact tag, commit, workflow and Release URLs, the release notes
sections, platform coverage, update-route evidence, validation, and
branch/worktree state.
