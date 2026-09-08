import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { GraftClient } from "./graft-client"
import { GraftInProcessTransport } from "./graft-in-process-transport"

it("commits selected files and leaves other edits for the next version", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-selected-"))
  const graft = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
  try {
    await graft.open(root)
    await graft.initialize(root)
    await fs.writeFile(path.join(root, "a.md"), "A")
    await fs.writeFile(path.join(root, "b.md"), "B")
    await graft.stageAll(root)
    await graft.commit(root, "Initial")
    await fs.writeFile(path.join(root, "a.md"), "A updated")
    await fs.writeFile(path.join(root, "b.md"), "B updated")
    await graft.stageSelected(root, ["a.md"])
    expect((await graft.status(root)).stagedPaths).toEqual(["a.md"])
    await expect(graft.stageSelected(root, ["b.md"])).rejects.toThrow(
      "already staged"
    )
    await graft.commit(root, "Only A")
    expect((await graft.status(root)).paths).toEqual(["b.md"])
    expect(await fs.readFile(path.join(root, "b.md"), "utf8")).toBe("B updated")
    await graft.stageSelected(root, ["b.md"])
    await graft.commit(root, "Only B")
    expect((await graft.status(root)).paths).toEqual([])
    await fs.unlink(path.join(root, "a.md"))
    await fs.writeFile(path.join(root, "new.md"), "New")
    await graft.stageSelected(root, ["a.md"])
    await graft.commit(root, "Delete A only")
    expect((await graft.status(root)).paths).toEqual(["new.md"])
  } finally {
    await graft.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})
