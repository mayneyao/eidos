# Release notes policy

Apply this policy to every tagged Eidos Lite or standalone CLI release.

## Use one source for one release

- The checked-in surface `RELEASE_NOTES.md` is a **single-release manifest**.
  It is not a changelog and must never accumulate previous versions.
- GitHub Releases are the immutable history after publication. Do not maintain
  a second cumulative release-history document in the repository.
- Replace the whole manifest during version preparation. Do not append new
  sections to the previous version and do not start by copying the previous
  body.
- The tag workflow must use the committed manifest as `body_path` when it first
  creates the Release. `generate_release_notes` must remain `false`.
- Do not publish a generated body temporarily and edit it after subscribers may
  have received a notification.

## Derive only this version's delta

Identify the previous tag in the same surface namespace. Build an evidence
table before writing prose:

| Candidate note     | User-visible evidence            | Owning surface | First shipped here? |
| ------------------ | -------------------------------- | -------------- | ------------------- |
| One concise change | Commit, test, or measured result | Lite or CLI    | Yes                 |

Every `###` section under `## What's new` must have one row. Exclude release
bookkeeping when deriving the delta: the release manifest itself, version-only
edits, lockfile churn caused only by a version bump, generated bundles, tags,
workflow mechanics, and previous release-preparation commits. Include a shared
package change only when that surface actually ships it in this version.

Combine multiple implementation commits for one user outcome into one section.
Split a section only when users can independently observe the outcomes. Never
repeat the same outcome under reliability, performance, and UX headings.

## Compare history before tagging

Read the complete bodies of the previous three releases from the same surface,
not the repository-wide latest Release. Compare headings and meaning, not just
exact text.

Run the deterministic local audit after rewriting the manifest:

```bash
node .codex/skills/eidos-release/scripts/audit-release-notes.mjs \
  --surface <lite|cli> \
  --tag <lite-vX.Y.Z|cli-vX.Y.Z>
```

The audit rejects duplicate sections inside the candidate, exact or near-copy
sections found in recent same-surface tags, empty sections, and GitHub's
generated monorepo-note boilerplate. It is a lower bound, not a substitute for
the semantic review: rewording an old feature is still a blocker.

For CLI, stable installer commands and the version-matched Skill link are
operational reference material. Put them under separate `## Install` and
`## Use with Codex` headings, not under `## What's new`. Their presence is
allowed across releases because their version-specific correctness is checked
separately; they must not be counted as new features.

## Require exact publication

Before the tag, read the final rendered Markdown and verify every claim against
the evidence table. After the workflow publishes, fetch the body through the
GitHub API and byte-compare it with the manifest at the release tag. A missing,
generated, stale, or subsequently edited body is a failed release even if all
binary assets exist.

If an already-published release contains duplicate or incorrect notes, do not
rewrite history silently. Report the affected tags, correct the public body
only with explicit authorization, and make the next release describe only its
own delta.
