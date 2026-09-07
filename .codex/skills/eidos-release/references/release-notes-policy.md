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

## Structure and categories

Release notes organize user-visible changes into standard, focused sections:

1. **`## What's new`**: New features and major capabilities introduced in this
   version. Format items with `### <Feature Title>` followed by a concise narrative
   explaining what changed, user value, and required actions.
2. **`## Improvements`**: User-visible enhancements, performance optimizations,
   and ergonomic refinements to pre-existing features. Format items with `### <Title>`
   or bullet points `- **<Area>**: <Description>`.
3. **`## Bug fixes`**: Fixes for bugs or unexpected behaviors in pre-existing
   functionality that shipped in prior releases. Format items with `### <Title>`
   or bullet points `- **<Area>**: <Description>`.
4. **Operational sections (CLI only)**: `## Install` and `## Use with Codex` /
   `## Use with an Agent` are reference material placed under separate level-two
   headings.

Notes must contain at least one user-visible content section (`What's new`,
`Improvements`, or `Bug fixes`). Sections with no applicable changes can be
omitted (for example, a maintenance patch may contain only `## Bug fixes`). Empty
headings, generic placeholders (such as "Bug fixes and improvements" with no
specific detail), and unreviewed GitHub monorepo-generated logs are blockers.

## Derive only this version's delta

Identify the previous tag in the same surface namespace. Release notes must
describe only the delta that is user-visible or perceivable when upgrading from
the previous release to the current candidate.

### Consolidate iterative fixes for new features

During development between two releases, a new feature is often introduced and
subsequently tweaked, refactored, or debugged across multiple commits.
**Do not list internal fixes for a new feature as separate bug fixes.**
To an end user upgrading from the previous version, the feature is entirely new;
intermediate bugs introduced and resolved during the same iteration were never
visible in a published release. All development fixes and adjustments targeting
a new feature must be consolidated and absorbed into that feature's description
under `## What's new`.

Only fixes addressing issues in functionality that existed in prior releases
belong under `## Bug fixes`.

### Exclude internal engineering and release bookkeeping

Exclude commits that do not produce an observable user outcome:

- The release manifest (`RELEASE_NOTES.md`) itself
- Version bumps and lockfile churn caused solely by version changes
- Workflow mechanics, CI definitions, and build tool adjustments
- Internal unit/integration test fixtures and refactors
- Generated bundles and artifacts

Build an evidence table before writing or finalizing prose:

| Candidate note     | Category            | User-visible evidence            | Owning surface | First shipped here? |
| ------------------ | ------------------- | -------------------------------- | -------------- | ------------------- |
| One concise change | New / Improve / Fix | Commit, test, or measured result | Lite or CLI    | Yes                 |

## Workflow: Script Extraction → Agent Authoring → Audit Gate

Writing release notes is a collaborative pipeline between deterministic tooling and the AI Agent:

1. **Step 1: Deterministic Evidence Extraction (Script)**
   Run `prepare-release-notes.mjs` to extract and structure the version delta:

   ```bash
   node .codex/skills/eidos-release/scripts/prepare-release-notes.mjs \
     --surface <lite|cli> \
     [--from <tag>] \
     [--to <ref>] \
     [--json]
   ```

   The script does the heavy lifting of factual analysis:
   - Resolves the baseline tag and scopes git diffs;
   - Clusters `feat:` commits into cohesive feature concepts;
   - Detects all development fixes/refactors targeting those new features and absorbs them into the feature entity;
   - Extracts genuine fixes for pre-existing features into `Bug fixes` and enhancements into `Improvements`;
   - Strips out internal CI, build, and bookkeeping churn.

2. **Step 2: User-Facing Authoring and Polishing (Agent / AI)**
   The Agent reads the structured evidence output from Step 1 (or its JSON representation).
   The Agent's role is to **author and polish the actual narrative**:
   - Translate clustered features into engaging, product-oriented sections under `## What's new`, explaining _what changed_, _why it matters to users_, and _how to use it_;
   - Fold the absorbed iterative fixes into the feature narrative (e.g., highlighting that search handles scrollbars, focus, and layout smoothly);
   - Polish the items under `## Improvements` and `## Bug fixes` into concise, readable summaries;
   - Write the finalized Markdown to `apps/<surface>/RELEASE_NOTES.md`.

3. **Step 3: Quality Gate Audit (Script)**
   Run `audit-release-notes.mjs` to verify the Agent's written notes against historical releases and formatting invariants.

## Compare history before tagging

Read the complete bodies of the previous three releases from the same surface,
not the repository-wide latest Release. Compare headings and meaning, not just
exact text.

Run the deterministic local audit after writing the manifest:

```bash
node .codex/skills/eidos-release/scripts/audit-release-notes.mjs \
  --surface <lite|cli> \
  --tag <lite-vX.Y.Z|cli-vX.Y.Z>
```

The audit verifies that:

- Headings are recognized and non-empty.
- At least one user-visible content section exists.
- Headings and bodies are not duplicated within the candidate.
- Content does not duplicate items from the recent three same-surface releases
  (structural and token similarity check).
- GitHub-generated monorepo-note boilerplate is rejected.

If an immutable failed tag must remain but never created a GitHub Release, the
next candidate may pass `--unpublished-tag <tag>`. Export `GH_TOKEN` in CI. Never
use this for a tag that has a GitHub Release, and never use it to hide previously
published release notes.

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
