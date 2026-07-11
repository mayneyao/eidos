// @vitest-environment node

import fs from "fs/promises"
import os from "os"
import path from "path"

import { afterEach, describe, expect, it } from "vitest"

import {
  EIDOS_GRAFT_IGNORE_END,
  EIDOS_GRAFT_IGNORE_START,
  ensureEidosGraftIgnore,
  mergeEidosGraftIgnore,
} from "./graft-ignore"

const temporarySpaces: string[] = []

afterEach(async () => {
  await Promise.all(
    temporarySpaces
      .splice(0)
      .map((spacePath) => fs.rm(spacePath, { recursive: true, force: true }))
  )
})

describe("mergeEidosGraftIgnore", () => {
  it("creates the managed block without excluding Obsidian metadata", () => {
    const result = mergeEidosGraftIgnore("")

    expect(result).toContain(EIDOS_GRAFT_IGNORE_START)
    expect(result).toContain(".graft/\n")
    expect(result).toContain(".graftignore\n")
    expect(result).toContain(".eidos/inbox.sqlite3\n")
    expect(result).toContain(".eidos/raw.sqlite3\n")
    expect(result).toContain(".eidos/sessions/\n")
    expect(result).toContain(".eidos/secrets.*\n")
    expect(result).toContain(".DS_Store\n")
    expect(result).not.toContain(".obsidian")
    expect(result.endsWith("\n")).toBe(true)
  })

  it("preserves user rules and is idempotent", () => {
    const original = "# My rules\nprivate-notes/\n"
    const once = mergeEidosGraftIgnore(original)

    expect(once.startsWith(original)).toBe(true)
    expect(mergeEidosGraftIgnore(once)).toBe(once)
  })

  it("updates only a complete managed block and preserves CRLF", () => {
    const original = [
      "user-before/",
      EIDOS_GRAFT_IGNORE_START,
      "obsolete-eidos-rule/",
      EIDOS_GRAFT_IGNORE_END,
      "user-after/",
      "",
    ].join("\r\n")

    const result = mergeEidosGraftIgnore(original)

    expect(result).toContain("user-before/\r\n")
    expect(result).toContain("\r\nuser-after/\r\n")
    expect(result).not.toContain("obsolete-eidos-rule/")
    expect(result).not.toMatch(/(?<!\r)\n/)
  })

  it("does not consume user content after an incomplete marker", () => {
    const original = `${EIDOS_GRAFT_IGNORE_START}\nuser-owned-rule/\n`
    const result = mergeEidosGraftIgnore(original)
    const repeated = mergeEidosGraftIgnore(result)

    expect(result.startsWith(original)).toBe(true)
    expect(result).toContain("user-owned-rule/")
    expect(
      result.match(new RegExp(EIDOS_GRAFT_IGNORE_START, "g"))
    ).toHaveLength(2)
    expect(repeated).toBe(result)
    expect(repeated).toContain("user-owned-rule/")
  })

  it("can roll back its own update without overwriting later user edits", async () => {
    const spacePath = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-space-"))
    temporarySpaces.push(spacePath)
    const ignorePath = path.join(spacePath, ".graftignore")
    await fs.writeFile(ignorePath, "private/\n", "utf8")

    const update = await ensureEidosGraftIgnore(spacePath)
    expect(update.changed).toBe(true)
    expect(await fs.readFile(ignorePath, "utf8")).toContain(
      EIDOS_GRAFT_IGNORE_START
    )

    await update.rollback()
    expect(await fs.readFile(ignorePath, "utf8")).toBe("private/\n")

    const secondUpdate = await ensureEidosGraftIgnore(spacePath)
    await fs.appendFile(ignorePath, "user-added-later/\n", "utf8")
    await secondUpdate.rollback()
    expect(await fs.readFile(ignorePath, "utf8")).toContain("user-added-later/")
  })

  it("removes a newly created ignore file when rolled back", async () => {
    const spacePath = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-space-"))
    temporarySpaces.push(spacePath)
    const ignorePath = path.join(spacePath, ".graftignore")

    const update = await ensureEidosGraftIgnore(spacePath)
    await update.rollback()

    await expect(fs.stat(ignorePath)).rejects.toMatchObject({ code: "ENOENT" })
  })
})
