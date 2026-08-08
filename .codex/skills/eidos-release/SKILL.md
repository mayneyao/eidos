---
name: eidos-release
description: Release Eidos Lite, the standalone Eidos CLI, and editor.eidos.space. Use when asked to prepare or publish a Lite or CLI version, deploy the Eidos File Web editor, update Lite's bundled Graft dependency, recover a failed release tag, or verify published artifacts and deployments.
---

# Eidos Release

Release one explicit surface at a time. Establish exact inputs, run the
surface-specific gates, create an immutable tag or deployment, monitor the
publisher, and prove the public result.

## Select the release surface

- **Eidos Lite:** read
  [references/eidos-lite-release.md](references/eidos-lite-release.md).
- **Standalone CLI:** read
  [references/cli-release.md](references/cli-release.md).
- **Eidos File Web:** read
  [references/web-editor-release.md](references/web-editor-release.md).

Do not conflate version namespaces or publishers:

- Lite uses `lite-v<semver>` and
  `.github/workflows/build-and-release-eidos-lite.yml`.
- CLI uses `cli-v<semver>` and
  `.github/workflows/build-and-release-cli.yml`.
- Web deploys independently through Wrangler to `editor.eidos.space`.
- `@eidos.space/eidos-file` and `@eidos.space/eidos-file-ui` package publishing
  is not implied by any of these releases.

## Preserve release invariants

- Read root and applicable nested `AGENTS.md` files first.
- Preserve unrelated user changes. Do not stage, format, stash, revert, or
  commit them.
- Never weaken tests or compatibility assertions to make a release green.
- Require the intended branch commit to exist on the remote before tagging.
- Use lightweight tags and never move a distributed tag.
- Never claim success from a local tag, green build, or successful deploy
  command alone. Prove remote state and public artifacts.

## Run preflight

Inspect the repository and exact target:

```bash
git status --short --branch
git log --oneline --decorate -8
git branch --show-current
git rev-list --left-right --count HEAD...@{upstream}
git tag --list <tag>
git ls-remote --tags origin refs/tags/<tag>
```

If the worktree contains unrelated changes, leave them untouched and determine
whether the release can proceed safely. Stop if the branch is behind or
diverged unless the user explicitly authorizes another source commit.

## Recover an empty failed tag attempt

Recreate a failed tag only when all conditions hold:

1. The tag was created during the current release attempt.
2. Its workflow failed.
3. The failed run has zero uploaded artifacts.
4. No GitHub Release exists for the tag.
5. No consumer could reasonably have received the tag.

Prove the conditions before deleting a tag:

```bash
gh run view <run-id> --json status,conclusion,headSha,url
gh api repos/<owner>/<repo>/actions/runs/<run-id>/artifacts --jq '.total_count'
gh release view <tag>
```

Otherwise prepare a new version or prerelease number. Never move a tag with a
Release, artifact, or plausible consumer.

## Prove publication

For tagged releases, verify local and remote SHAs, the exact workflow run, the
GitHub Release, expected assets, checksums, and an installed or packaged smoke.
For Web deployments, verify the active Cloudflare version plus fresh public
HTML, service worker, bundle, and user-flow evidence.

Always report the released/deployed commit, tag or deployment ID, public URLs,
validation performed, artifact/platform coverage, and branch/worktree state.
