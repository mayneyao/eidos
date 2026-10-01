import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, expect, it } from "vitest"
import { filemeta } from "./filemeta"
import { resolveVTabExtensionPath } from "./vtab-resolver"

let root: string
beforeEach(async () => {
  root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-properties-"))
  )
  await fs.writeFile(path.join(root, "note.txt"), "content")
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

it("shares namespace properties with fs_meta while preserving undeclared JSON fields", async () => {
  const ns = "space.eidos.test"
  expect(await filemeta(root, "note.txt", ns)).toEqual({})
  const initial = {
    rating: 4,
    custom: { enabled: true, list: ["a", null] },
    obsolete: "old",
  }
  expect(await filemeta(root, "note.txt", ns, { set: initial })).toEqual(
    initial
  )
  const db = new DatabaseSync(":memory:", { allowExtension: true })
  try {
    db.loadExtension(resolveVTabExtensionPath("fs_meta")!)
    db.exec(
      `CREATE VIRTUAL TABLE files USING fs_meta(root='${root.replaceAll("'", "''")}', namespace='${ns}', fields='rating INTEGER')`
    )
    expect(
      db.prepare("SELECT rating FROM files WHERE _id = 'note.txt'").get()
        ?.rating
    ).toBe(4)
    db.exec("UPDATE files SET rating = 5 WHERE _id = 'note.txt'")
    expect(
      await filemeta(root, "note.txt", ns, {
        set: { nullable: null },
        remove: ["obsolete"],
      })
    ).toEqual({ rating: 5, custom: initial.custom, nullable: null })
    expect(await filemeta(root, "note.txt", "space.eidos.other")).toEqual({})
    expect(await fs.readFile(path.join(root, "note.txt"), "utf8")).toBe(
      "content"
    )
  } finally {
    db.close()
  }
})

it("rejects unsafe files and malformed patches without touching existing metadata", async () => {
  const ns = "space.eidos.test"
  await filemeta(root, "note.txt", ns, { set: { kept: true } })
  await expect(
    filemeta(root, "note.txt", ns, {
      set: { kept: false },
      remove: ["kept"],
    })
  ).rejects.toThrow()
  await expect(filemeta(root, "missing.txt", ns)).rejects.toThrow()
  await expect(filemeta(root, "../escape", ns)).rejects.toThrow()
  await expect(
    filemeta(root, "note.txt", "invalid/namespace")
  ).rejects.toThrow()
  await fs.symlink(path.join(root, "note.txt"), path.join(root, "link.txt"))
  await expect(filemeta(root, "link.txt", ns)).rejects.toThrow()
  if (process.platform !== "win32") {
    await fs.link(path.join(root, "note.txt"), path.join(root, "hard.txt"))
    await expect(
      filemeta(root, "hard.txt", ns, { set: { kept: false } })
    ).rejects.toThrow()
  }
  expect(await filemeta(root, "note.txt", ns)).toEqual({ kept: true })
})
