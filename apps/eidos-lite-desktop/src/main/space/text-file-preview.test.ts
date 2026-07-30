import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { EIDOS_LITE_TEXT_PREVIEW_BYTES_MAX } from "../../shared/contracts"
import { readTextFilePreview } from "./text-file-preview"

describe("text file preview", () => {
  it("reads UTF-8 text without changing the file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-text-"))
    const filePath = path.join(root, "notes.md")
    await fs.writeFile(filePath, "# Notes\n\nA local file.\n")
    try {
      await expect(
        readTextFilePreview(root, "notes.md")
      ).resolves.toMatchObject({
        type: "text",
        relativePath: "notes.md",
        content: "# Notes\n\nA local file.\n",
        encoding: "utf-8",
        truncated: false,
      })
      await expect(fs.readFile(filePath, "utf8")).resolves.toBe(
        "# Notes\n\nA local file.\n"
      )
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("recognizes BOM-marked UTF-16 text", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-text-"))
    const encoded = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from("Hello, 世界", "utf16le"),
    ])
    await fs.writeFile(path.join(root, "unicode.txt"), encoded)
    try {
      await expect(
        readTextFilePreview(root, "unicode.txt")
      ).resolves.toMatchObject({
        type: "text",
        content: "Hello, 世界",
        encoding: "utf-16le",
      })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("returns a bounded preview for a large text file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-text-"))
    await fs.writeFile(
      path.join(root, "large.txt"),
      "x".repeat(EIDOS_LITE_TEXT_PREVIEW_BYTES_MAX + 64)
    )
    try {
      const preview = await readTextFilePreview(root, "large.txt")
      expect(preview).toMatchObject({ type: "text", truncated: true })
      expect(preview.type === "text" ? preview.content.length : 0).toBe(
        EIDOS_LITE_TEXT_PREVIEW_BYTES_MAX
      )
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("does not decode binary files or follow symlinks", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-text-"))
    const outside = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-text-outside-")
    )
    await fs.writeFile(path.join(root, "image.bin"), Buffer.from([0, 1, 2, 3]))
    await fs.writeFile(path.join(outside, "secret.txt"), "outside")
    await fs.symlink(
      path.join(outside, "secret.txt"),
      path.join(root, "linked.txt")
    )
    try {
      await expect(
        readTextFilePreview(root, "image.bin")
      ).resolves.toMatchObject({ type: "unavailable", reason: "binary" })
      await expect(
        readTextFilePreview(root, "linked.txt")
      ).resolves.toMatchObject({ type: "unavailable", reason: "symlink" })
    } finally {
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(outside, { recursive: true, force: true }),
      ])
    }
  })

  it("rejects paths outside the Space and identifies directories", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-text-"))
    await fs.mkdir(path.join(root, "notes"))
    try {
      await expect(readTextFilePreview(root, "../outside.txt")).rejects.toThrow(
        "Path escapes the Space"
      )
      await expect(readTextFilePreview(root, "notes")).resolves.toMatchObject({
        type: "unavailable",
        reason: "not-file",
      })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
