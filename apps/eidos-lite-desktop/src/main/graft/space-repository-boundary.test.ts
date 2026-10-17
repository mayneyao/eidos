import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { assertSpaceRepositoryBoundary } from "./space-repository-boundary"

it("rejects parent repository discovery before initialization and permits an independent local boundary", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-repository-boundary-")
  )
  try {
    await fs.mkdir(path.join(root, ".graft"))
    await fs.writeFile(path.join(root, ".graft", "sentinel"), "unchanged")
    const child = path.join(root, "child")
    await fs.mkdir(child)
    await expect(assertSpaceRepositoryBoundary(child)).rejects.toThrow(
      "inside another Graft repository"
    )
    expect(
      await fs.readFile(path.join(root, ".graft", "sentinel"), "utf8")
    ).toBe("unchanged")
    await fs.mkdir(path.join(child, ".graft"))
    await expect(assertSpaceRepositoryBoundary(child)).resolves.toBeUndefined()
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
