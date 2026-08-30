---
name: eidos-release
description: Assess release impact and release Eidos File npm packages, Eidos Lite, the standalone CLI, editor.eidos.space, or Eidos Publish. Use when asked what changes need shipping, to prepare or publish a version, deploy a hosted surface, write or audit release notes, update Lite's bundled Graft dependency, recover a failed release tag, or verify published artifacts and deployments.
---

# Eidos Release

Assess all affected surfaces before mutating release state, then release one
explicit surface at a time. Establish exact inputs, run the surface-specific
gates, create an immutable tag or deployment, monitor the publisher, and prove
the public result.

## Assess release impact

When the user asks what needs to ship, or the change set crosses shared Runtime,
UI, CLI, or hosted-service boundaries, read
[references/release-impact.md](references/release-impact.md). Produce an
evidence-backed plan before choosing versions, tags, or deployment commands.

Impact assessment may identify multiple required surfaces. That does not make
their versions, publishers, release notes, or proof interchangeable. Prepare and
prove each selected surface independently.

## Select the release surface

- **Eidos File npm packages:** read
  [references/eidos-file-packages-release.md](references/eidos-file-packages-release.md).
- **Eidos Lite:** read
  [references/release-notes-policy.md](references/release-notes-policy.md), then
  [references/eidos-lite-release.md](references/eidos-lite-release.md).
- **Standalone CLI:** read
  [references/release-notes-policy.md](references/release-notes-policy.md), then
  [references/cli-release.md](references/cli-release.md).
- **Eidos File Web:** read
  [references/web-editor-release.md](references/web-editor-release.md).
- **Eidos Publish:** read
  [references/publish-service-release.md](references/publish-service-release.md).

Do not conflate version namespaces or publishers:

- Eidos File packages use `eidos-file-packages-v<semver>` and
  `.github/workflows/publish-eidos-file-packages.yml`. Publish only through
  GitHub Actions with npm Trusted Publishing; never run `npm publish` locally.
- Lite uses `lite-v<semver>` and
  `.github/workflows/build-and-release-eidos-lite.yml`.
- CLI uses `cli-v<semver>` and
  `.github/workflows/build-and-release-cli.yml`.
- Web deploys independently through Wrangler to `editor.eidos.space`.
- Publish deploys independently through Wrangler to `publish.eidos.space`, its
  Container Runtime, and the public `*.eidos.ink` viewer path owned by Relay.
- Package, Lite, CLI, Web, and Publish delivery remain independent even when
  the same source changes affect more than one surface.

## Preserve release invariants

- Read root and applicable nested `AGENTS.md` files first.
- Preserve unrelated user changes. Do not stage, format, stash, revert, or
  commit them.
- Never weaken tests or compatibility assertions to make a release green.
- Require the intended branch commit to exist on the remote before tagging.
- Use lightweight tags and never move a distributed tag.
- For tagged releases, require a curated, non-empty, surface-specific release
  body before creating the tag. An empty body, placeholder, or unreviewed
  generated commit list is a release blocker.
- Treat each checked-in `RELEASE_NOTES.md` as the body for one version, not as
  an accumulating changelog. Replace it completely during release preparation.
- Publish that committed body when the GitHub Release is first created. Never
  create a generated body and repair it later.
- Compare the candidate with the previous three same-surface releases. Reused
  feature sections, semantic restatements of an old change, and changes owned
  only by another release surface are blockers.
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
GitHub Release, its non-empty curated body, expected assets, checksums, and an
installed or packaged smoke. For Web and Publish deployments, verify the active
Cloudflare version plus commit provenance, fresh public assets, and relevant
production user-flow evidence. Publish proof must also cover its Container
Runtime and public viewer path.

Always report the released/deployed commit, tag or deployment ID, public URLs,
validation performed, artifact/platform coverage, and branch/worktree state.
