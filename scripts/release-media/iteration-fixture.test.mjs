import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { safeRelative, snapshotFiles, sameFiles } from "./iteration-utils.mjs"

test("only the intentional root .gitignore is allowed among dotfile fixture paths", () => {
  assert.equal(safeRelative(".gitignore"), ".gitignore")
  for (const path of [
    ".git",
    ".eidos",
    "Notes/.gitignore",
    ".gitignore/nested",
    "../.gitignore",
    "/.gitignore",
  ])
    assert.throws(() => safeRelative(path), /Unsafe fixture path/)
})

test("preparation snapshots the ignored synthetic note and refuses to replace a case", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eidos-ignore-fixture-"))
  const out = join(directory, "case")
  const script = fileURLToPath(
    new URL("./prepare-iteration.mjs", import.meta.url)
  )
  try {
    execFileSync(process.execPath, [script, "--out", out], { stdio: "pipe" })
    const manifest = JSON.parse(
      await readFile(join(out, "fixture.manifest.json"), "utf8")
    )
    assert.equal(manifest.files.length, 6)
    assert.equal(
      await readFile(join(manifest.space, ".gitignore"), "utf8"),
      "Scratch/\n"
    )
    assert.ok(
      manifest.files.some((file) => file.path === "Scratch/Ignored scratch.md")
    )
    const snapshot = await snapshotFiles(
      manifest.space,
      manifest.files.map((file) => file.path)
    )
    assert.ok(sameFiles(manifest.files, snapshot))
    assert.throws(
      () =>
        execFileSync(process.execPath, [script, "--out", out], {
          stdio: "pipe",
        }),
      /EEXIST/
    )
    assert.ok(
      sameFiles(
        snapshot,
        await snapshotFiles(
          manifest.space,
          manifest.files.map((file) => file.path)
        )
      )
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
