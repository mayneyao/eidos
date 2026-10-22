import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

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

test("accepts multi-section notes with What's new, Improvements, and Bug fixes", () => {
  const markdown = [
    "## What's new",
    "",
    "### Workspace Search",
    "",
    "Search text across the whole space with Cmd+Shift+F.",
    "",
    "## Improvements",
    "",
    "- **Explorer**: Preserve scroll position when loading folders.",
    "- **Quick Open**: Keep quick open responsive in large repositories.",
    "",
    "## Bug fixes",
    "",
    "- **Session**: Avoid collision during concurrent file open.",
    "- **Diff**: Keep diff close button aligned with title.",
    "",
    "## Install",
    "",
    "curl -fsSL https://download.eidos.space/cli/install.sh | sh",
  ].join("\n")

  const result = auditBodies(markdown, [])
  assert.equal(result.sectionCount, 5)
})

test("accepts patch release notes with only Bug fixes", () => {
  const patchNotes = [
    "## Bug fixes",
    "",
    "- **Database**: Resolve database lock on quick app restart.",
  ].join("\n")

  const result = auditBodies(patchNotes, [])
  assert.equal(result.sectionCount, 1)
})

test("rejects empty Bug fixes or Improvements section and unrecognized headings", () => {
  assert.throws(
    () => auditBodies("## Bug fixes\n\n", []),
    /empty section: ## Bug fixes/u
  )
  assert.throws(
    () => auditBodies("## Unknown Heading\n\nSomething here.", []),
    /unrecognized heading: ## Unknown Heading/u
  )
})

const auditor = fileURLToPath(
  new URL("./audit-release-notes.mjs", import.meta.url)
)
const candidateNotes = notes(
  "Column filter shortcut",
  "Choose a file extension directly from the current column header menu."
)

function runAuditor(t, options = {}) {
  const directory = mkdtempSync(
    path.join(tmpdir(), "eidos-release-notes-audit-")
  )
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const bin = path.join(directory, "bin")
  const ghLog = path.join(directory, "gh-calls.jsonl")
  mkdirSync(bin)
  for (const surface of ["cli", "eidos-lite-desktop"]) {
    const folder = path.join(directory, "apps", surface)
    mkdirSync(folder, { recursive: true })
    writeFileSync(path.join(folder, "RELEASE_NOTES.md"), candidateNotes)
  }
  const tags = options.tags ?? [
    "lite-v0.26.1",
    "lite-v0.26.0",
    "lite-v0.25.0",
    "lite-v0.24.0",
    "lite-v0.23.0",
    "cli-v0.26.1",
    "cli-v0.26.0",
    "cli-v0.25.0",
  ]
  const bodies = Object.fromEntries(
    tags.map((tag) => [
      tag,
      notes(`Historical ${tag}`, `Previously published change for ${tag}.`),
    ])
  )
  bodies["lite-v0.26.1"] = candidateNotes
  Object.assign(bodies, options.bodies)
  const fakeCommands = `#!/usr/bin/env node
const fs = require("node:fs")
const path = require("node:path")
const command = path.basename(process.argv[1])
const args = process.argv.slice(2)
if (command === "git") {
  if (args[0] === "tag" && args[1] === "--list") {
    const prefix = args[2].slice(0, -1)
    const tags = JSON.parse(process.env.AUDIT_TEST_TAGS)
    console.log(tags.filter(tag => tag.startsWith(prefix)).join("\\n"))
  } else if (args[0] === "show") {
    const body = JSON.parse(process.env.AUDIT_TEST_BODIES)[args[1].split(":")[0]]
    if (body === undefined) process.exit(1)
    process.stdout.write(body)
  } else process.exit(2)
} else if (command === "gh") {
  fs.appendFileSync(process.env.AUDIT_TEST_GH_LOG, JSON.stringify(args) + "\\n")
  const mode = process.env.AUDIT_TEST_GH_MODE
  if (mode === "published") console.log(JSON.stringify({ tagName: args[2] }))
  else {
    if (mode === "network") console.error("Could not connect to api.github.com")
    else if (mode === "generic-404") console.error("HTTP 404: Not Found")
    else console.error("release not found")
    process.exit(1)
  }
} else process.exit(2)
`
  for (const command of ["git", "gh"])
    writeFileSync(path.join(bin, command), fakeCommands, { mode: 0o700 })
  const result = spawnSync(
    process.execPath,
    [
      auditor,
      "--surface",
      options.surface ?? "lite",
      "--tag",
      options.tag ?? "lite-v0.26.2",
      ...(options.unpublishedTags ?? []).flatMap((tag) => [
        "--unpublished-tag",
        tag,
      ]),
    ],
    {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        AUDIT_TEST_TAGS: JSON.stringify(tags),
        AUDIT_TEST_BODIES: JSON.stringify(bodies),
        AUDIT_TEST_GH_LOG: ghLog,
        AUDIT_TEST_GH_MODE: options.ghMode ?? "unpublished",
      },
    }
  )
  assert.ifError(result.error)
  const ghCalls = existsSync(ghLog)
    ? readFileSync(ghLog, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
    : []
  return { ...result, ghCalls }
}

const subprocessOptions = { skip: process.platform === "win32" }

test(
  "Lite 0.26.2 verifies and excludes the known failed tag",
  subprocessOptions,
  (t) => {
    const result = runAuditor(t)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /3 prior same-surface release\(s\) checked/u)
    assert.deepEqual(result.ghCalls, [
      ["release", "view", "lite-v0.26.1", "--json", "tagName"],
    ])
  }
)

test(
  "deduplicates the known tag and explicit unpublished exceptions",
  subprocessOptions,
  (t) => {
    const result = runAuditor(t, {
      unpublishedTags: ["lite-v0.26.1", "lite-v0.26.1"],
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.ghCalls.length, 1)
  }
)

for (const [ghMode, message] of [
  ["published", /has a GitHub Release and cannot be marked unpublished/u],
  ["network", /could not verify unpublished tag.*Could not connect/u],
  ["generic-404", /could not verify unpublished tag.*HTTP 404/u],
]) {
  test(
    `rejects the known tag when verification returns ${ghMode}`,
    subprocessOptions,
    (t) => {
      const result = runAuditor(t, { ghMode })
      assert.equal(result.status, 1)
      assert.match(result.stderr, message)
      assert.equal(result.ghCalls.length, 1)
    }
  )
}

test(
  "requires the known failed tag to exist locally",
  subprocessOptions,
  (t) => {
    const result = runAuditor(t, { tags: ["lite-v0.26.0"] })
    assert.equal(result.status, 1)
    assert.match(
      result.stderr,
      /unpublished tag does not exist locally: lite-v0\.26\.1/u
    )
    assert.deepEqual(result.ghCalls, [])
  }
)

for (const tag of ["lite-v0.26.0", "lite-v0.26.1", "cli-v0.26.2"]) {
  test(
    `does not apply the known failed tag to ${tag}`,
    subprocessOptions,
    (t) => {
      const result = runAuditor(t, {
        tag,
        surface: tag.startsWith("cli-") ? "cli" : "lite",
        ghMode: "published",
      })
      assert.equal(result.status, 0, result.stderr)
      assert.deepEqual(result.ghCalls, [])
    }
  )
}

test(
  "still verifies CLI explicit unpublished exceptions",
  subprocessOptions,
  (t) => {
    const result = runAuditor(t, {
      surface: "cli",
      tag: "cli-v0.26.2",
      unpublishedTags: ["cli-v0.26.1"],
      bodies: { "cli-v0.26.1": candidateNotes },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(result.ghCalls, [
      ["release", "view", "cli-v0.26.1", "--json", "tagName"],
    ])
  }
)

test(
  "still rejects notes copied from a published historical tag",
  subprocessOptions,
  (t) => {
    const result = runAuditor(t, {
      bodies: { "lite-v0.26.0": candidateNotes },
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /repeats .*lite-v0\.26\.0/u)
  }
)
