import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { restoreTextVersion } from "./restore-text-version"
import { readTextFilePreview } from "./text-file-preview"

it("rejects symlinks, non-text targets and oversized versions without replacing files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lite-restore-guard-"))
  try {
    await fs.writeFile(path.join(root, "note.md"), "Current")
    await fs.symlink(path.join(root, "note.md"), path.join(root, "link.md"))
    await expect(
      restoreTextVersion(
        root,
        { path: "link.md", revision: "old", expectedRevision: null },
        "Old"
      )
    ).rejects.toThrow()
    await expect(
      restoreTextVersion(
        root,
        { path: "database.eidos", revision: "old", expectedRevision: null },
        "Old"
      )
    ).rejects.toThrow()
    const preview = await readTextFilePreview(root, "note.md")
    if (preview.type !== "text") throw new Error("Expected text")
    await expect(
      restoreTextVersion(
        root,
        {
          path: "note.md",
          revision: "old",
          expectedRevision: preview.revision,
        },
        "x".repeat(2 * 1024 * 1024 + 1)
      )
    ).rejects.toThrow("2 MB")
    expect(await fs.readFile(path.join(root, "note.md"), "utf8")).toBe(
      "Current"
    )
    expect((await fs.readdir(root)).sort()).toEqual(["link.md", "note.md"])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
