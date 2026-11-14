import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  importMarkdownDocumentFile,
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
  await fs.writeFile(path.join(root, "blog.eidos"), "")
  return fs.realpath(root)
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  )
})

describe("Markdown document images", () => {
  it("imports ordinary attachment bytes with portable relative URLs, preserves collisions and rejects symlink targets", async () => {
    const root = await fixture()
    const data = new TextEncoder().encode("%PDF-1.4 attachment")
    const request = {
      relativePath: "notes/readme.md",
      name: "中文 [预算] (1) #%.pdf",
      data,
    }
    const first = await importMarkdownDocumentFile(root, request)
    const second = await importMarkdownDocumentFile(root, request)
    expect(first.markdownUrl).toMatch(/^assets\//)
    expect(decodeURIComponent(first.markdownUrl)).toBe(
      `assets/${path.basename(first.relativePath)}`
    )
    expect(first.markdownUrl).not.toMatch(/[ ()#\[\]]/)
    expect(second.relativePath).not.toBe(first.relativePath)
    await expect(
      fs.readFile(path.join(root, first.relativePath))
    ).resolves.toEqual(Buffer.from(data))
    await expect(
      fs.readFile(path.join(root, second.relativePath))
    ).resolves.toEqual(Buffer.from(data))
    await fs.mkdir(path.join(root, "linked"))
    await fs.writeFile(path.join(root, "linked", "note.md"), "note")
    await fs.symlink(
      path.join(root, "notes", "assets"),
      path.join(root, "linked", "assets")
    )
    await expect(
      importMarkdownDocumentFile(root, {
        ...request,
        relativePath: "linked/note.md",
      })
    ).rejects.toThrow("ordinary folder")
    await expect(
      importMarkdownDocumentFile(root, {
        ...request,
        relativePath: "../outside.md",
      })
    ).rejects.toThrow()
    await expect(
      importMarkdownDocumentFile(root, { ...request, data: new Uint8Array() })
    ).rejects.toThrow("64 MiB")
  })

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

  it("resolves an explicit Space-root image exactly without changing relative-path safety", async () => {
    const root = await fixture()
    await fs.mkdir(path.join(root, "images"))
    await fs.mkdir(path.join(root, "notes", "images"))
    const name = "同名 #[]%.png"
    await fs.writeFile(path.join(root, "images", name), PNG)
    await fs.writeFile(path.join(root, "notes", "images", name), PNG)
    const encoded = `images/${encodeURIComponent(name)}`
    await expect(
      resolveMarkdownDocumentImage(root, "notes/readme.md", `/${encoded}`)
    ).resolves.toMatchObject({ relativePath: `images/${name}` })
    await expect(
      resolveMarkdownDocumentImage(root, "notes/readme.md", encoded)
    ).resolves.toMatchObject({ relativePath: `notes/images/${name}` })
    for (const unsafe of [
      "/../secret.png",
      "/%2e%2e/secret.png",
      "/images%2fsecret.png",
      "/images%5csecret.png",
      "//host/image.png",
      "/.graft/secret.png",
      "/.eidos/secret.png",
      "/.git/secret.png",
      "/C:/secret.png",
      "/%43%3A/secret.png",
      "C:\\secret.png",
    ]) {
      await expect(
        resolveMarkdownDocumentImage(root, "notes/readme.md", unsafe)
      ).rejects.toThrow()
    }
    await expect(
      resolveMarkdownDocumentImage(root, "notes/readme.md", "/missing.png")
    ).resolves.toBeNull()
    // An explicit root target never falls back to a matching short name elsewhere.
    await fs.writeFile(path.join(root, "notes", "missing.png"), PNG)
    await expect(
      resolveMarkdownDocumentImage(root, "notes/readme.md", "/missing.png")
    ).resolves.toBeNull()
    await fs.symlink(
      path.join(root, "images", name),
      path.join(root, "images", "linked.png")
    )
    await expect(
      resolveMarkdownDocumentImage(
        root,
        "notes/readme.md",
        "/images/linked.png"
      )
    ).resolves.toBeNull()
    await fs.writeFile(path.join(root, "images", "active.svg"), ACTIVE_SVG)
    await expect(
      resolveMarkdownDocumentImage(
        root,
        "notes/readme.md",
        "/images/active.svg"
      )
    ).resolves.toBeNull()
  })

  it("resolves and imports images for an Eidos File Content field", async () => {
    const root = await fixture()
    await fs.mkdir(path.join(root, "assets"))
    await fs.writeFile(path.join(root, "assets", "cover.png"), PNG)

    await expect(
      resolveMarkdownDocumentImage(root, "blog.eidos", "assets/cover.png")
    ).resolves.toMatchObject({
      relativePath: "assets/cover.png",
      mediaType: "image/png",
      previewUrl: expect.stringMatching(/^eidos-space-media:\/\/preview\//u),
    })

    const imported = await importMarkdownDocumentImage(root, {
      relativePath: "blog.eidos",
      name: "diagram.png",
      data: PNG,
    })
    expect(imported).toEqual({
      markdownUrl: "assets/diagram.png",
      relativePath: "assets/diagram.png",
      mediaType: "image/png",
    })
    await expect(
      fs.readFile(path.join(root, "assets", "diagram.png"))
    ).resolves.toEqual(Buffer.from(PNG))
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
