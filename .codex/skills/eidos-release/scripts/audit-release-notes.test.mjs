import assert from "node:assert/strict"
import test from "node:test"

import { auditBodies, parseWhatsNew } from "./audit-release-notes.mjs"

const notes = (heading, body, footer = "") =>
  `## What's new\n\n### ${heading}\n\n${body}\n${footer}`

test("accepts a release-scoped change and ignores an operational footer", () => {
  const result = auditBodies(
    notes(
      "Faster clone planning",
      "Clone now measures the complete object plan before transfer begins.",
      "\n## Install\n\nUse the stable installer.\n"
    ),
    [
      {
        body: notes(
          "Visible transfer progress",
          "Downloads now report transferred bytes and the known total."
        ),
        label: "lite-v1.0.0",
      },
    ]
  )

  assert.deepEqual(result, { historyCount: 1, sectionCount: 1 })
})

test("rejects a section copied from an earlier release", () => {
  const repeated =
    "History now marks the last locally known cloud checkpoint after fetch or push."

  assert.throws(
    () =>
      auditBodies(notes("Cloud checkpoint", repeated), [
        {
          body: notes("Cloud checkpoint", repeated),
          label: "lite-v1.0.0",
        },
      ]),
    /repeats .*lite-v1\.0\.0/u
  )
})

test("requires repeated topics to name the new delta", () => {
  assert.throws(
    () =>
      auditBodies(
        notes(
          "Sync progress",
          "The panel now separates object planning from network transfer."
        ),
        [
          {
            body: notes(
              "Sync progress",
              "Uploads now show transferred bytes, total size, speed, and ETA."
            ),
            label: "lite-v1.0.0",
          },
        ]
      ),
    /repeats .*lite-v1\.0\.0/u
  )
})

test("compares older notes without imposing the new structure on history", () => {
  const result = auditBodies(
    notes(
      "Verified self-upgrade",
      "The CLI now verifies and atomically installs its own release archive."
    ),
    [
      {
        body: notes(
          "Version-matched Eidos Skill for Codex",
          "Install the Skill from the immutable CLI tag for this version."
        ),
        label: "cli-v1.0.0",
      },
    ]
  )

  assert.deepEqual(result, { historyCount: 1, sectionCount: 1 })
})

test("rejects duplicate candidate bodies and generated GitHub notes", () => {
  const body = "One concrete user-visible improvement with enough detail."
  assert.throws(
    () =>
      auditBodies(
        `## What's new\n\n### First\n\n${body}\n\n### Second\n\n${body}\n`,
        []
      ),
    /repeats the body/u
  )
  assert.throws(
    () => parseWhatsNew("## What's new\n\n## What's Changed\n"),
    /generated release-note boilerplate/u
  )
  assert.throws(
    () =>
      parseWhatsNew(
        "## What's new\n\n### Version-matched Eidos Skill for Codex\n\nInstall it.\n"
      ),
    /generic or operational heading/u
  )
})
