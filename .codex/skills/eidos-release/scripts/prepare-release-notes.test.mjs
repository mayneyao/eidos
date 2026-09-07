import assert from "node:assert/strict"
import test from "node:test"

import {
  analyzeCommits,
  formatDraftNotes,
  parseCommitMessage,
} from "./prepare-release-notes.mjs"

test("parseCommitMessage parses conventional commit formats", () => {
  const feat = parseCommitMessage(
    "feat(search): add workspace search\n\nFull text indexing."
  )
  assert.equal(feat.type, "feat")
  assert.equal(feat.scope, "search")
  assert.equal(feat.subject, "add workspace search")
  assert.equal(feat.body, "Full text indexing.")
  assert.equal(feat.isBreaking, false)

  const breaking = parseCommitMessage(
    "feat(formula)!: adopt SQLite 3.45\n\nBREAKING CHANGE: profile changes."
  )
  assert.equal(breaking.type, "feat")
  assert.equal(breaking.scope, "formula")
  assert.equal(breaking.isBreaking, true)

  const unscoped = parseCommitMessage("fix: resolve crash on exit")
  assert.equal(unscoped.type, "fix")
  assert.equal(unscoped.scope, "")
  assert.equal(unscoped.subject, "resolve crash on exit")
})

test("analyzeCommits absorbs iterative fixes for new features into the feature and excludes them from bugFixes", () => {
  const commits = [
    {
      hash: "11111111",
      type: "feat",
      scope: "search",
      subject: "add workspace text search",
      body: "Enables searching across the space.",
      files: ["apps/eidos-lite-desktop/src/renderer/search/view.ts"],
    },
    {
      hash: "22222222",
      type: "fix",
      scope: "search",
      subject: "fix search input focus loss",
      body: "",
      files: ["apps/eidos-lite-desktop/src/renderer/search/view.ts"],
    },
    {
      hash: "33333333",
      type: "fix",
      scope: "lite",
      subject: "keep search results stable while opening matches",
      body: "",
      files: ["apps/eidos-lite-desktop/src/renderer/search/view.ts"],
    },
    {
      hash: "44444444",
      type: "fix",
      scope: "explorer",
      subject: "preserve scroll position when opening folders",
      body: "",
      files: ["apps/eidos-lite-desktop/src/renderer/explorer/tree.ts"],
    },
    {
      hash: "55555555",
      type: "perf",
      scope: "grid",
      subject: "render virtualized rows smoothly",
      body: "",
      files: ["packages/eidos-file-ui/src/grid/virtual.ts"],
    },
    {
      hash: "66666666",
      type: "chore",
      scope: "ci",
      subject: "update test runners",
      body: "",
      files: [".github/workflows/test.yml"],
    },
  ]

  const newFiles = new Set([
    "apps/eidos-lite-desktop/src/renderer/search/view.ts",
  ])

  const result = analyzeCommits({ commits, newFiles })

  // Exactly 1 new feature
  assert.equal(result.features.length, 1)
  const searchFeat = result.features[0]
  assert.equal(searchFeat.commit.subject, "add workspace text search")

  // The 2 fixes targeting search must be absorbed into searchFeat!
  assert.equal(searchFeat.absorbedCommits.length, 2)
  const absorbedHashes = searchFeat.absorbedCommits.map((c) => c.hash)
  assert.deepEqual(absorbedHashes, ["22222222", "33333333"])

  // Bug fixes must ONLY contain the fix for pre-existing explorer scroll!
  assert.equal(result.bugFixes.length, 1)
  assert.equal(result.bugFixes[0].hash, "44444444")
  assert.equal(
    result.bugFixes[0].subject,
    "preserve scroll position when opening folders"
  )

  // Improvements must contain the perf commit
  assert.equal(result.improvements.length, 1)
  assert.equal(result.improvements[0].hash, "55555555")

  // Excluded must contain chore commit
  assert.equal(result.excluded.length, 1)
  assert.equal(result.excluded[0].commit.hash, "66666666")
})

test("formatDraftNotes generates clean markdown with What's new, Improvements, and Bug fixes", () => {
  const features = [
    {
      title: "Workspace Text Search",
      commit: {
        subject: "add workspace text search",
        body: "Enables fast fuzzy search across all files.",
      },
      absorbedCommits: [],
    },
  ]
  const improvements = [
    {
      scope: "grid",
      subject: "render virtualized rows smoothly",
    },
  ]
  const bugFixes = [
    {
      scope: "explorer",
      subject: "preserve scroll position when opening folders",
    },
  ]

  const markdown = formatDraftNotes({
    features,
    improvements,
    bugFixes,
    surface: "lite",
  })

  assert.match(markdown, /^## What's new\s*$/m)
  assert.match(markdown, /### Workspace Text Search/)
  assert.match(markdown, /Enables fast fuzzy search across all files\./)
  assert.match(markdown, /^## Improvements\s*$/m)
  assert.match(markdown, /- \*\*Grid\*\*: Render virtualized rows smoothly/)
  assert.match(markdown, /^## Bug fixes\s*$/m)
  assert.match(
    markdown,
    /- \*\*Explorer\*\*: Preserve scroll position when opening folders/
  )
})
