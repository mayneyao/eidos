import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { renameNoReplace } from "./rename-no-replace"

it("allows only one of two concurrent native moves to the same destination", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-exclusive-move-"))
  const names = ["甲.txt", "乙.txt"]
  try {
    for (const name of names) await fs.writeFile(path.join(root, name), name)
    const target = path.join(root, "目标.txt")
    const results = await Promise.allSettled(
      names.map((name) => renameNoReplace(path.join(root, name), target))
    )
    const winner = results.findIndex((result) => result.status === "fulfilled")
    expect(winner).not.toBe(-1)
    const loser = 1 - winner
    expect(results[loser]).toMatchObject({
      status: "rejected",
      reason: { code: "EEXIST" },
    })
    expect(await fs.readFile(target, "utf8")).toBe(names[winner])
    expect(await fs.readFile(path.join(root, names[loser]!), "utf8")).toBe(
      names[loser]
    )
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

it("preserves a separate hard link and an empty destination directory", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-exclusive-move-"))
  try {
    const source = path.join(root, "source")
    const target = path.join(root, "target")
    await fs.writeFile(source, "file")
    await fs.link(source, target)
    await expect(renameNoReplace(source, target)).rejects.toMatchObject({
      code: "EEXIST",
    })
    expect(await fs.readFile(source, "utf8")).toBe("file")
    expect(await fs.readFile(target, "utf8")).toBe("file")

    const directory = path.join(root, "directory")
    const destination = path.join(root, "destination")
    await fs.mkdir(directory)
    await fs.writeFile(path.join(directory, "child"), "child")
    await fs.mkdir(destination)
    await expect(renameNoReplace(directory, destination)).rejects.toThrow()
    expect(await fs.readdir(directory)).toEqual(["child"])
    expect(await fs.readdir(destination)).toEqual([])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
