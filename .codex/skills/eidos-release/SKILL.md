---
name: eidos-release
description: Release Eidos versions. Use when the user asks to bump the Eidos app version, create or push stable release tags, create or push beta tags such as beta.6, or verify an Eidos release tag in this repository.
---

# Eidos Release

Run a tight release: identify the intended version and tag, use the repository version script for version bumps, push, then prove the remote state.

## Release Shape

Infer the release shape from the request and repository state.

- Version bump plus beta tag: if the user says "更新版本到 0.33.0 并且 tag beta.1 推送", run the matching version script increment, create `v0.33.0-beta.1`, and push the branch plus tag.
- Beta tag only: if the user says "beta.6 推送", read the current app version from root `package.json`, create `v<current-version>-beta.6` on `HEAD`, and push only that tag.
- Stable tag: for a stable release, use `v<version>` with the current or newly bumped app version.
- Bare tags: do not create `beta.N` tags unless the user explicitly asks for a bare tag after being told the repository convention is `v<version>-beta.N`.

Completion criterion: the intended version, script increment, and exact tag name are known before any write or push.

## Preflight

Inspect before changing anything:

```bash
git status --short --branch
git log --oneline --decorate -8
node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync('package.json','utf8')).version)"
git tag --list <tag>
git ls-remote --tags origin refs/tags/<tag>
git rev-list --left-right --count HEAD...@{u}
```

Rules:

- Treat existing uncommitted changes as user work. Do not stage, format, revert, stash, or otherwise modify them unless they are part of the release.
- Prefer `git ls-remote --tags origin refs/tags/<tag>` for tag existence checks. Avoid `git fetch --tags` in this repo because local historical tags can differ from `origin`.
- If the target tag already exists locally or remotely, stop and report the commit it points to.
- If the branch is behind or diverged from upstream, stop unless the user explicitly asked to tag the current local `HEAD`.
- If the branch is ahead and the release includes a version-bump commit, push the branch with the tag.

Completion criterion: no unrelated work is staged, the upstream relationship is understood, and the target tag is confirmed absent.

## Version Bump

Use the repository script as the single source of truth for app version changes:

```bash
pnpm patch
pnpm minor
pnpm major
```

These commands call `node scripts/version.cjs <increment>`. The script updates and commits:

- `package.json`
- `apps/desktop/package.json`
- `apps/web-app/package.json`
- `packages/lib/env.ts`
- `apps/cli/Cargo.toml`

Choose the increment that makes `semver.inc(currentVersion, increment)` equal the requested version. Example: from `0.32.2` to `0.33.0`, use `pnpm minor`.

Script rules:

- The script requires a completely clean worktree. If `git status --porcelain` is non-empty, stop and tell the user the version script cannot run until those changes are committed, stashed, or explicitly approved for temporary stashing.
- Do not manually edit the five version files to bypass the script.
- Do not use the script if `patch`, `minor`, or `major` cannot produce the requested version in one increment. Stop and report that the repository script does not support that exact bump.
- The script creates the commit message `Update to version <version>`.

After the script runs, verify the version commit:

```bash
git show --name-only --oneline --stat HEAD
```

Completion criterion: the script-created commit exists, all five sources report the requested version, and the commit contains only the script-managed version files.

## Tag And Push

Eidos release tags are lightweight tags. Match existing convention:

```bash
git tag <tag>
git push origin <branch> <tag>   # use when a release commit was created
git push origin <tag>            # use for tag-only releases
```

Use the current branch name from `git status --short --branch` or `git branch --show-current`; do not assume `main`.

Completion criterion: the push exits successfully and reports the new tag on `origin`.

## Verification

Prove the result:

```bash
git status --short --branch
git ls-remote --tags origin refs/tags/<tag>
git show --no-patch --decorate --oneline <tag>
git rev-list --left-right --count HEAD...@{u}
```

For version bumps, also re-check all five version sources.

Final response must include:

- The exact tag and commit SHA.
- Whether a version commit was created and pushed.
- Whether the working tree still contains unrelated user changes.
- What validation ran, and any validation intentionally skipped.

Completion criterion: the final answer is backed by remote tag evidence and local status evidence.
