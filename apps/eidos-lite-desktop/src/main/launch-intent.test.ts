import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  eidosFilePathsFromArguments,
  resolveEidosFileLaunchIntent,
} from "./launch-intent"

describe("Eidos File launch intents", () => {
  it("extracts unique absolute .eidos paths from application arguments", () => {
    const root = path.join(path.parse(process.cwd()).root, "Eidos Space")
    expect(
      eidosFilePathsFromArguments(
        [
          "--inspect",
          "notes.txt",
          "Roadmap.eidos",
          "Roadmap.eidos",
          path.join(root, "Tasks.EIDOS"),
        ],
        root
      )
    ).toEqual([
      path.join(root, "Roadmap.eidos"),
      path.join(root, "Tasks.EIDOS"),
    ])
  })

  it("maps a real Eidos File to its canonical parent Space", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-launch-"))
    const root = path.join(parent, "Space")
    const alias = path.join(parent, "Space Alias")
    await fs.mkdir(root)
    const file = path.join(root, "Roadmap.eidos")
    await fs.writeFile(file, "fixture")
    await fs.symlink(root, alias)
    try {
      const intent = await resolveEidosFileLaunchIntent(
        path.join(alias, "Roadmap.eidos")
      )
      expect(intent.spaceRoot).toBe(await fs.realpath(root))
      expect(intent.relativePath).toBe("Roadmap.eidos")
      expect(intent.spaceId).toHaveLength(24)
    } finally {
      await fs.rm(parent, { recursive: true, force: true })
    }
  })

  it("prefers the deepest known Space containing a nested Eidos File", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-launch-"))
    const root = path.join(parent, "Space")
    const nested = path.join(root, "projects")
    const file = path.join(nested, "Roadmap.eidos")
    await fs.mkdir(nested, { recursive: true })
    await fs.writeFile(file, "fixture")
    try {
      const intent = await resolveEidosFileLaunchIntent(file, [parent, root])
      expect(intent.spaceRoot).toBe(await fs.realpath(root))
      expect(intent.relativePath).toBe("projects/Roadmap.eidos")
    } finally {
      await fs.rm(parent, { recursive: true, force: true })
    }
  })

  it("rejects file symlinks and non-Eidos files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-launch-"))
    const file = path.join(root, "Roadmap.eidos")
    const alias = path.join(root, "Alias.eidos")
    await fs.writeFile(file, "fixture")
    await fs.symlink(file, alias)
    try {
      await expect(resolveEidosFileLaunchIntent(alias)).rejects.toThrow(
        "symlink"
      )
      await expect(
        resolveEidosFileLaunchIntent(path.join(root, "notes.txt"))
      ).rejects.toThrow("Only .eidos")
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
