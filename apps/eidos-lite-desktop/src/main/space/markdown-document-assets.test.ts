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
const SAFE_SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g" /></defs><rect width="10" height="10" fill="url(#g)" /></svg>'
)
const ACTIVE_SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
)

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

  it("resolves Obsidian vault-root and shortest-name image embeds", async () => {
    const root = await fixture()
    await fs.mkdir(path.join(root, "Attachments"))
    await fs.writeFile(path.join(root, "Attachments", "diagram.png"), PNG)

    await expect(
      resolveMarkdownDocumentImage(
        root,
        "notes/readme.md",
        "Attachments/diagram.png"
      )
    ).resolves.toMatchObject({
      relativePath: "Attachments/diagram.png",
      mediaType: "image/png",
    })
    await expect(
      resolveMarkdownDocumentImage(root, "notes/readme.md", "diagram.png")
    ).resolves.toMatchObject({
      relativePath: "Attachments/diagram.png",
      mediaType: "image/png",
    })
  })

  it("imports and resolves static SVG images while rejecting active SVG", async () => {
    const root = await fixture()
    const imported = await importMarkdownDocumentImage(root, {
      relativePath: "notes/readme.md",
      name: "diagram.svg",
      data: SAFE_SVG,
    })

    expect(imported).toEqual({
      markdownUrl: "assets/diagram.svg",
      relativePath: "notes/assets/diagram.svg",
      mediaType: "image/svg+xml",
    })
    await expect(
      resolveMarkdownDocumentImage(
        root,
        "notes/readme.md",
        "assets/diagram.svg"
      )
    ).resolves.toMatchObject({
      relativePath: "notes/assets/diagram.svg",
      mediaType: "image/svg+xml",
      previewUrl: expect.stringMatching(/^eidos-space-media:\/\/preview\//u),
    })
    await expect(
      importMarkdownDocumentImage(root, {
        relativePath: "notes/readme.md",
        name: "active.svg",
        data: ACTIVE_SVG,
      })
    ).rejects.toThrow("not a supported image")
    await fs.writeFile(path.join(root, "notes", "active.svg"), ACTIVE_SVG)
    await expect(
      resolveMarkdownDocumentImage(root, "notes/readme.md", "active.svg")
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
