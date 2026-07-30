import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { vi } from "vitest"

import { readWorkingTextContent } from "./working-text-reader"

describe("working text reader", () => {
  it("reads complete UTF-8 content and reports a missing file as absent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-working-text-"))
    await fs.writeFile(path.join(root, "notes.md"), "# Notes\n你好\n")
    try {
      await expect(
        readWorkingTextContent(root, "notes.md", 1024)
      ).resolves.toEqual({
        state: "utf8",
        content: "# Notes\n你好\n",
        size: Buffer.byteLength("# Notes\n你好\n"),
      })
      await expect(
        readWorkingTextContent(root, "deleted.md", 1024)
      ).resolves.toEqual({ state: "absent" })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("refuses oversized, binary, and symbolic-link content", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-working-text-"))
    const outside = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-working-text-outside-")
    )
    await fs.writeFile(path.join(root, "large.md"), "x".repeat(65))
    await fs.writeFile(path.join(root, "binary.md"), Buffer.from([0, 1, 2]))
    await fs.writeFile(path.join(outside, "outside.md"), "outside")
    await fs.symlink(
      path.join(outside, "outside.md"),
      path.join(root, "linked.md")
    )
    try {
      await expect(
        readWorkingTextContent(root, "large.md", 64)
      ).resolves.toEqual({ state: "too_large", size: 65 })
      await expect(
        readWorkingTextContent(root, "binary.md", 64)
      ).resolves.toEqual({ state: "invalid_utf8", size: 3 })
      await expect(
        readWorkingTextContent(root, "linked.md", 64)
      ).resolves.toEqual({ state: "unsafe_path", size: expect.any(Number) })
    } finally {
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(outside, { recursive: true, force: true }),
      ])
    }
  })

  it("rejects a file replaced between path validation and reading", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-working-text-"))
    const filePath = path.join(root, "notes.md")
    const replacement = path.join(root, "replacement.md")
    await fs.writeFile(filePath, "before")
    await fs.writeFile(replacement, "after")
    const realpath = fs.realpath.bind(fs)
    let calls = 0
    const spy = vi.spyOn(fs, "realpath").mockImplementation(async (target) => {
      const resolved = await realpath(target)
      calls += 1
      if (calls === 2) await fs.rename(replacement, filePath)
      return resolved
    })
    try {
      await expect(
        readWorkingTextContent(root, "notes.md", 1024)
      ).resolves.toEqual({ state: "changed_during_read", size: 5 })
    } finally {
      spy.mockRestore()
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
