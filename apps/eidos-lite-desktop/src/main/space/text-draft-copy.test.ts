import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { writeTextDraftCopy } from "./text-draft-copy"

it("saves Unicode drafts without overwriting an original, existing copy or symlink", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lite-draft-copy-"))
  try {
    const original = path.join(root, "note.md")
    const copy = path.join(root, "note-copy.md")
    await fs.writeFile(original, "external edit")
    await expect(writeTextDraftCopy(original, "draft")).rejects.toMatchObject({
      code: "EEXIST",
    })
    await writeTextDraftCopy(copy, "# 我的草稿\n")
    expect(await fs.readFile(copy, "utf8")).toBe("# 我的草稿\n")
    await expect(
      writeTextDraftCopy(copy, "another draft")
    ).rejects.toMatchObject({ code: "EEXIST" })
    if (process.platform !== "win32") {
      const link = path.join(root, "linked.md")
      await fs.symlink(original, link)
      await expect(writeTextDraftCopy(link, "draft")).rejects.toMatchObject({
        code: "EEXIST",
      })
    }
    expect(await fs.readFile(original, "utf8")).toBe("external edit")
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
