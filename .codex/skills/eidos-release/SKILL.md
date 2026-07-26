---
name: eidos-release
description: Release Eidos Desktop, the standalone Eidos CLI, editor.eidos.space, and the bundled Graft runtime. Use when the user asks to deploy eidos-file-web, release or install the Rust CLI, bump an Eidos version, update the pinned Graft release, create or recover stable/prerelease tags, run a release pipeline, or verify remote deployment and artifacts.
---

# Eidos Release

Release through explicit gates: establish the exact inputs, integrate dependencies, validate locally, create the tag once, monitor the tag-triggered pipeline, and prove the published remote state.

## Select the release path

Classify the request before writing:

- **Version bump plus prerelease:** bump the app version, then tag `v<version>-beta.N`, `-alpha.N`, or `-rc.N`.
- **Prerelease tag only:** read the current root app version and tag the current validated `HEAD`.
- **Stable release:** use `v<version>`.
- **Standalone CLI release:** use `cli-v<version>` from the independent version in `apps/cli/Cargo.toml`.
- **Bundled Graft update:** integrate the latest official Graft release before the app version/tag work.
- **Web editor deployment:** validate and deploy `eidos-file-web` to `editor.eidos.space` through Wrangler.
- **Tag recovery:** repair and recreate a tag only under the empty failed-attempt rules below.

For a Desktop release or Graft update, read [references/desktop-release.md](references/desktop-release.md) completely before taking release actions.

For an `eidos-file-web` deployment, read [references/web-editor-release.md](references/web-editor-release.md) completely before building or deploying.

For a standalone CLI release, read [references/cli-release.md](references/cli-release.md) completely before changing versions, tags, installers, or release assets.

Do not conflate release surfaces. Desktop uses `v*`; standalone CLI uses `cli-v*`; neither deploys `editor.eidos.space` nor publishes `@eidos.space/eidos-file` / `@eidos.space/eidos-file-ui`. Each is a separate audited workflow.

Completion criterion: know the requested app version, dependency version, exact tag, target commit, and release channel before any tag or push.

## Preserve release invariants

- Read root and applicable nested `AGENTS.md` files first.
- Preserve unrelated user changes. Do not stage, format, stash, revert, or commit them.
- Never weaken a test or compatibility assertion merely to make a release green.
- Never modify the sibling Graft repository while consuming an official Graft release.
- Stop any workspace-owned Desktop development process before Node tests.
- Run Node tests and Desktop builds serially because they share one linked `better-sqlite3` binary.
- Use lightweight Eidos release tags, matching repository convention.
- Never create a bare `beta.N` tag unless the user explicitly requests it after being told the convention.
- Never claim release success from a local tag or a green build job alone. Require the remote tag, completed release workflow, GitHub Release, and expected uploaded assets.
- Never claim Web deployment success from a successful Wrangler command alone. Require a new active Cloudflare deployment and fresh public bundle evidence.

## Run preflight

Inspect repository and remote state:

```bash
git status --short --branch
git log --oneline --decorate -8
git branch --show-current
node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync('package.json','utf8')).version)"
git tag --list <tag>
git ls-remote --tags origin refs/tags/<tag>
git rev-list --left-right --count HEAD...@{u}
```

Apply these gates:

- If unrelated work is present, leave it untouched and determine whether the requested release can proceed safely. The version script itself requires a clean tree.
- If the target tag exists locally or remotely, stop unless performing an explicitly justified failed-attempt recovery.
- If the branch is behind or diverged, stop unless the user explicitly authorized tagging the current local `HEAD`.
- If the branch is ahead, identify every unpublished commit before tagging.
- Verify that no unrelated changes are staged.

## Bump the app version

Use the repository script as the only version source-of-truth writer:

```bash
pnpm patch
pnpm minor
pnpm major
```

Choose the increment whose `semver.inc(currentVersion, increment)` equals the requested base version. The script requires a clean tree and creates `Update to version <version>` while updating:

- `package.json`
- `apps/desktop/package.json`
- `apps/web-app/package.json`
- `packages/lib/env.ts`

Do not manually bypass the script. If one supported increment cannot produce the requested version, stop and report the limitation.

After the script, inspect the release commit with `git show --name-only --oneline --stat HEAD`.

Completion criterion: all four app version sources agree on the base version and each release-preparation commit has a coherent scope. Do not change the independent CLI version during an app bump.

## Validate before tagging

Run validation proportional to the release surface. For Desktop or Graft changes, use every gate in the Desktop reference.

At minimum:

- Run targeted tests for changed release/runtime code.
- Run type checks and API/fixture checks relevant to changed packages.
- Run `git diff --check` and the repository formatter check for changed files.
- Build the Desktop unpacked app with `pnpm build:desktop:dev` when native/runtime delivery changed.
- Verify the packaged runtime, not only source files.

Classify every failure as a baseline issue, concurrent/user change, or release regression. Fix release regressions before tagging; do not merely record them.

## Tag and start the release

Push cohesive preparation commits before or together with the tag. Resolve the current branch dynamically:

```bash
git tag <tag>
git push origin <branch> <tag>
```

The `v*` tag triggers `.github/workflows/build-and-release-desktop-app.yml`; do not manually create a duplicate GitHub Release. A `cli-v*` tag instead triggers `.github/workflows/build-and-release-cli.yml` and must follow the CLI reference. Monitor the exact run:

```bash
gh run list --workflow build-and-release-desktop-app.yml --limit 10
gh run watch <run-id> --exit-status
```

Do not stop at the first red job. Read the failing step logs, fix in scope, rerun the relevant local gate, and continue until the release succeeds or a genuine external blocker remains.

## Recover an empty failed tag attempt

Treat tags as immutable after distribution. Recreate a failed tag only when all conditions hold:

1. The tag was created during the current release attempt.
2. Its release workflow failed.
3. The failed workflow has zero uploaded artifacts.
4. No GitHub Release exists for the tag.
5. No user or external consumer could reasonably have received the tag.

Prove conditions 2–4:

```bash
gh run view <run-id> --json status,conclusion,headSha,url
gh api repos/<owner>/<repo>/actions/runs/<run-id>/artifacts --jq '.total_count'
gh release view <tag>
```

Only then delete the failed remote/local tag, apply and validate the repair, recreate the tag on the repaired commit, and push it. Never move a published tag or a tag with artifacts. After a successful Release, use a new prerelease number for product changes.

If a post-release change affects only CI execution and not shipped product code, push it to the branch, run its focused workflow, and leave the successful release tag unchanged.

## Prove publication

Verify local, remote, workflow, and Release state:

```bash
git status --short --branch
git rev-list --left-right --count HEAD...@{u}
git rev-parse HEAD
git rev-parse <tag>
git ls-remote origin refs/heads/<branch> refs/tags/<tag>
gh run view <run-id> --json status,conclusion,headSha,url
gh release view <tag> --json url,isDraft,isPrerelease,publishedAt,targetCommitish,assets
```

Confirm every expected installer and update metadata file is present, in `uploaded` state, and has a digest. Confirm prerelease/stable classification matches the tag.

For Desktop releases, the final response must include:

- Exact tag and tag commit SHA.
- Release URL and successful workflow URL.
- Dependency version integrated, when applicable.
- Asset count/platform coverage.
- Validation performed and any allowed degradation.
- Any CI-only follow-up commit after the tag.
- Cleanliness and branch/upstream state.

For CLI releases, report the exact `cli-v*` tag and commit, workflow and Release URLs, seven expected assets, checksum/install smoke evidence, `LATEST` value, and branch/upstream state.

For Web deployments, report the deployed commit, Cloudflare deployment/version IDs, public URL, production bundle evidence, PWA update behavior, validation, and remaining unrelated worktree changes.
