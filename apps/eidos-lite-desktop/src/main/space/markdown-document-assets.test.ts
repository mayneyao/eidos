import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  importMarkdownDocumentImage,
  resolveMarkdownDocumentImage,
} from "./markdown-document-assets"

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
])

const roots: string[] = []

async function fixture() {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-lite-markdown-assets-")
  )
  roots.push(root)
  await fs.mkdir(path.join(root, "notes"))
  await fs.writeFile(path.join(root, "notes", "readme.md"), "# Readme\n")
  return fs.realpath(root)
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  )
})

describe("Markdown document images", () => {
  it("stores pasted images beside their document without overwriting names", async () => {
    const root = await fixture()
    const first = await importMarkdownDocumentImage(root, {
      relativePath: "notes/readme.md",
      name: "diagram.jpeg",
      data: PNG,
    })
    const second = await importMarkdownDocumentImage(root, {
      relativePath: "notes/readme.md",
      name: "diagram.jpeg",
      data: PNG,
    })

    expect(first).toEqual({
      markdownUrl: "assets/diagram.png",
      relativePath: "notes/assets/diagram.png",
      mediaType: "image/png",
    })
    expect(second.markdownUrl).toBe("assets/diagram%20(2).png")
    await expect(
      fs.readFile(path.join(root, "notes", "assets", "diagram.png"))
    ).resolves.toEqual(Buffer.from(PNG))
  })

  it("gives generic clipboard images readable timestamped names", async () => {
    const root = await fixture()
    const now = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.UTC(2026, 8, 3, 1, 2, 3, 456))
    try {
      const imported = await importMarkdownDocumentImage(root, {
        relativePath: "notes/readme.md",
        name: "image (1).png",
        data: PNG,
      })
      expect(imported.markdownUrl).toBe(
        "assets/pasted-image-20260903-010203-456.png"
      )
    } finally {
      now.mockRestore()
    }
  })

  it("resolves existing relative raster images and ignores network images", async () => {
    const root = await fixture()
    await fs.mkdir(path.join(root, "notes", "images"))
    await fs.writeFile(path.join(root, "notes", "images", "cover.png"), PNG)

    await expect(
      resolveMarkdownDocumentImage(root, "notes/readme.md", "images/cover.png")
    ).resolves.toMatchObject({
      relativePath: "notes/images/cover.png",
      mediaType: "image/png",
      previewUrl: expect.stringMatching(/^eidos-space-media:\/\/preview\//u),
    })
    await expect(
      resolveMarkdownDocumentImage(
        root,
        "notes/readme.md",
        "https://example.com/cover.png"
      )
    ).resolves.toBeNull()
  })

  it("rejects traversal, symlinked files, and bytes that are not images", async () => {
    const root = await fixture()
    await fs.writeFile(path.join(root, "secret.png"), PNG)
    await fs.mkdir(path.join(root, "notes", "images"))
    await fs.symlink(
      path.join(root, "secret.png"),
      path.join(root, "notes", "images", "linked.png")
    )

    await expect(
      resolveMarkdownDocumentImage(root, "notes/readme.md", "../secret.png")
    ).rejects.toThrow("escapes")
    await expect(
      resolveMarkdownDocumentImage(root, "notes/readme.md", "images/linked.png")
    ).resolves.toBeNull()
    await expect(
      importMarkdownDocumentImage(root, {
        relativePath: "notes/readme.md",
        name: "not-an-image.png",
        data: new TextEncoder().encode("not an image"),
      })
    ).rejects.toThrow("not a supported image")
  })
})
