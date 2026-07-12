// @vitest-environment node

import fs from "fs/promises"
import os from "os"
import path from "path"

import { afterEach, describe, expect, it } from "vitest"

import {
  EIDOS_GRAFT_IGNORE_END,
  EIDOS_GRAFT_IGNORE_START,
  ensureEidosGraftIgnore,
} from "./graft-ignore"

// Regression: ISSUE-001 — opening a remote Space dirtied a tracked .graftignore
// Found by /qa on 2026-07-12
// Report: .gstack/qa-reports/qa-report-desktop-versioning-2026-07-12.md
describe("existing repository ignore ownership", () => {
  const temporarySpaces: string[] = []

  afterEach(async () => {
    await Promise.all(
      temporarySpaces
        .splice(0)
        .map((spacePath) => fs.rm(spacePath, { recursive: true, force: true }))
    )
  })

  async function createSpace(content?: string): Promise<string> {
    const spacePath = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-graft-ignore-regression-")
    )
    temporarySpaces.push(spacePath)
    if (content !== undefined) {
      await fs.writeFile(path.join(spacePath, ".graftignore"), content, "utf8")
    }
    return spacePath
  }

  it("does not take ownership of an existing unmarked ignore file", async () => {
    const original = ".graft-clone.sqlite\ncontrol.sqlite\n"
    const spacePath = await createSpace(original)

    const update = await ensureEidosGraftIgnore(spacePath, {
      appendToExisting: false,
    })

    expect(update.changed).toBe(false)
    expect(
      await fs.readFile(path.join(spacePath, ".graftignore"), "utf8")
    ).toBe(original)
  })

  it("still creates a local ignore when the repository has none", async () => {
    const spacePath = await createSpace()

    const update = await ensureEidosGraftIgnore(spacePath, {
      appendToExisting: false,
    })

    expect(update.changed).toBe(true)
    expect(
      await fs.readFile(path.join(spacePath, ".graftignore"), "utf8")
    ).toContain(EIDOS_GRAFT_IGNORE_START)
  })

  it("refreshes a file that is already owned by Eidos", async () => {
    const spacePath = await createSpace(
      [
        EIDOS_GRAFT_IGNORE_START,
        "obsolete-rule/",
        EIDOS_GRAFT_IGNORE_END,
        "",
      ].join("\n")
    )

    const update = await ensureEidosGraftIgnore(spacePath, {
      appendToExisting: false,
    })
    const result = await fs.readFile(
      path.join(spacePath, ".graftignore"),
      "utf8"
    )

    expect(update.changed).toBe(true)
    expect(result).not.toContain("obsolete-rule/")
    expect(result).toContain(".eidos/sessions/")
  })
})
