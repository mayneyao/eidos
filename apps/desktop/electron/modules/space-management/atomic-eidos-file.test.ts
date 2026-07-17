import { writeFileSync } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { SpaceFiles } from "@eidos.space/file-space"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createEidosFileAtomically } from "./atomic-eidos-file"

describe("createEidosFileAtomically", () => {
  let root: string
  let files: SpaceFiles

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "eidos-atomic-base-"))
    files = new SpaceFiles(root)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("publishes the Eidos File only after initialization succeeds", async () => {
    const close = vi.fn()

    await createEidosFileAtomically(
      files,
      "tasks.eidos",
      { title: "Tasks" },
      (filePath) => {
        expect(path.basename(filePath)).not.toBe("tasks.eidos")
        writeFileSync(filePath, "initialized Eidos File")
        return { close }
      }
    )

    expect(close).toHaveBeenCalledOnce()
    expect(await readFile(path.join(root, "tasks.eidos"), "utf8")).toBe(
      "initialized Eidos File"
    )
    expect(await files.list()).toEqual([
      expect.objectContaining({ name: "tasks.eidos", path: "tasks.eidos" }),
    ])
  })

  it("does not leave the destination or temporary file when initialization fails", async () => {
    await expect(
      createEidosFileAtomically(files, "tasks.eidos", {}, () => {
        throw new Error("initialization failed")
      })
    ).rejects.toThrow("initialization failed")

    await expect(
      readFile(path.join(root, "tasks.eidos"))
    ).rejects.toMatchObject({
      code: "ENOENT",
    })
    expect(await files.list("", { includeHidden: true })).toEqual([])
  })
})
