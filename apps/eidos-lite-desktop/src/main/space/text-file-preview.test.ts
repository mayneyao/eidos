import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { EIDOS_LITE_TEXT_PREVIEW_BYTES_MAX } from "../../shared/contracts"
import { readTextFilePreview, saveTextFile } from "./text-file-preview"

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
        bom: false,
        revision: expect.stringMatching(/^[a-f\d]{64}$/u),
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
        bom: true,
      })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("issues an isolated browser preview for bounded HTML files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-text-"))
    await fs.writeFile(
      path.join(root, "dashboard.html"),
      "<!doctype html><title>Dashboard</title>"
    )
    try {
      await expect(
        readTextFilePreview(root, "dashboard.html")
      ).resolves.toMatchObject({
        type: "text",
        relativePath: "dashboard.html",
        browserPreview: {
          kind: "html",
          url: expect.stringMatching(
            /^eidos-space-document:\/\/[\w-]+\/dashboard\.html$/u
          ),
        },
        truncated: false,
      })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("issues a browser preview for bounded Markdown files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-text-"))
    await fs.writeFile(path.join(root, "README.md"), "# Read me")
    try {
      await expect(
        readTextFilePreview(root, "README.md")
      ).resolves.toMatchObject({
        type: "text",
        relativePath: "README.md",
        browserPreview: {
          kind: "markdown",
        },
        truncated: false,
      })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("saves text atomically while preserving encoding and BOM", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-text-"))
    const filePath = path.join(root, "unicode.txt")
    await fs.writeFile(
      filePath,
      Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from("Before", "utf16le"),
      ])
    )
    try {
      const preview = await readTextFilePreview(root, "unicode.txt")
      expect(preview.type).toBe("text")
      if (preview.type !== "text") return

      const result = await saveTextFile(root, {
        relativePath: "unicode.txt",
        content: "After 世界",
        expectedRevision: preview.revision,
      })
      expect(result).toMatchObject({
        status: "saved",
        file: { content: "After 世界", encoding: "utf-16le", bom: true },
      })
      const bytes = await fs.readFile(filePath)
      expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xfe]))
      expect(bytes.subarray(2).toString("utf16le")).toBe("After 世界")
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("does not overwrite a file changed outside Eidos Lite", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-text-"))
    const filePath = path.join(root, "notes.txt")
    await fs.writeFile(filePath, "original")
    try {
      const preview = await readTextFilePreview(root, "notes.txt")
      expect(preview.type).toBe("text")
      if (preview.type !== "text") return

      await fs.writeFile(filePath, "external change")
      const result = await saveTextFile(root, {
        relativePath: "notes.txt",
        content: "editor change",
        expectedRevision: preview.revision,
      })
      expect(result).toMatchObject({
        status: "conflict",
        current: { type: "text", content: "external change" },
      })
      await expect(fs.readFile(filePath, "utf8")).resolves.toBe(
        "external change"
      )
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

  it("routes browser-native media files to a streamed preview", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-text-"))
    await fs.writeFile(
      path.join(root, "photo.png"),
      Buffer.from([0x89, 0x50, 0x4e, 0x47])
    )
    await fs.writeFile(path.join(root, "clip.mp4"), Buffer.from([0, 1, 2, 3]))
    try {
      await expect(
        readTextFilePreview(root, "photo.png")
      ).resolves.toMatchObject({
        type: "media",
        relativePath: "photo.png",
        mediaKind: "image",
        mimeType: "image/png",
        previewUrl: expect.stringMatching(
          /^eidos-space-media:\/\/preview\/[\w-]+$/u
        ),
      })
      await expect(
        readTextFilePreview(root, "clip.mp4")
      ).resolves.toMatchObject({
        type: "media",
        mediaKind: "video",
        mimeType: "video/mp4",
      })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
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
