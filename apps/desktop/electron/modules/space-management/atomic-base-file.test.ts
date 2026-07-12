import { writeFileSync } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { SpaceFiles } from "@eidos.space/file-space"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createBaseFileAtomically } from "./atomic-base-file"

describe("createBaseFileAtomically", () => {
  let root: string
  let files: SpaceFiles

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "eidos-atomic-base-"))
    files = new SpaceFiles(root)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("publishes the Base only after initialization succeeds", async () => {
    const close = vi.fn()

    await createBaseFileAtomically(
      files,
      "tasks.base",
      { title: "Tasks" },
      (filePath) => {
        expect(path.basename(filePath)).not.toBe("tasks.base")
        writeFileSync(filePath, "initialized Base")
        return { close }
      }
    )

    expect(close).toHaveBeenCalledOnce()
    expect(await readFile(path.join(root, "tasks.base"), "utf8")).toBe(
      "initialized Base"
    )
    expect(await files.list()).toEqual([
      expect.objectContaining({ name: "tasks.base", path: "tasks.base" }),
    ])
  })

  it("does not leave the destination or temporary file when initialization fails", async () => {
    await expect(
      createBaseFileAtomically(files, "tasks.base", {}, () => {
        throw new Error("initialization failed")
      })
    ).rejects.toThrow("initialization failed")

    await expect(readFile(path.join(root, "tasks.base"))).rejects.toMatchObject(
      {
        code: "ENOENT",
      }
    )
    expect(await files.list("", { includeHidden: true })).toEqual([])
  })
})
