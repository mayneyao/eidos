import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expect, it } from "vitest"
import type { FileListOptions } from "@eidos.space/plugin-sdk"
import { SpaceSession } from "./space-session"

it("lists directory levels including empty folders without changing recursive file indexes", async () => {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-tree-list-"))
  )
  try {
    await fs.mkdir(path.join(root, "docs"))
    await fs.mkdir(path.join(root, "empty"))
    await fs.writeFile(path.join(root, "docs/note.md"), "note")
    await fs.writeFile(path.join(root, "readme.md"), "root")
    const session = {
      canonical: { root },
      prioritizeLocalWork() {},
    } as unknown as SpaceSession
    const list = (folder: string, options?: FileListOptions) =>
      SpaceSession.prototype.listFiles.call(session, folder, options)
    expect((await list("")).map((file) => file.path)).toEqual([
      "docs/note.md",
      "readme.md",
    ])
    const level = await list("", {
      recursive: false,
      includeDirectories: true,
      extensions: [".md"],
    })
    expect(level.map((file) => [file.path, file.isDirectory])).toEqual([
      ["docs", true],
      ["empty", true],
      ["readme.md", false],
    ])
    expect(level.every((file) => typeof file.modifiedAtMs === "number")).toBe(
      true
    )
    expect(
      (await list("docs", { recursive: false, includeDirectories: true })).map(
        (file) => file.path
      )
    ).toEqual(["docs/note.md"])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
