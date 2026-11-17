import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { eidosFileUriClass } from "@eidos.space/eidos-file"
import {
  resolveMarkdownDocumentImage,
  resolveMarkdownDocumentLink,
} from "./markdown-document-assets"
import {
  prepareMarkdownLinkMove,
  applyMarkdownLinkMove,
} from "./markdown-link-maintenance"
import { resolveEidosFileAttachment } from "./eidos-file-attachments"
import { SpaceSession } from "./space-session"

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])

it("keeps shared assets in place across Markdown and .markdown moves, resolving encoded body destinations and suffixes", async () => {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-body-links-"))
  )
  try {
    await fs.mkdir(path.join(root, "notes/deep"), { recursive: true })
    await fs.mkdir(path.join(root, "assets"))
    const name = "图 #100%.png"
    await fs.writeFile(path.join(root, "assets", name), PNG)
    await fs.writeFile(path.join(root, "assets/plan.pdf"), "%PDF-1.4 synthetic")
    const href = `../assets/${encodeURIComponent(name)}`
    const body = `# A\r\n![image](${href}?v=1#view)\r\n[plan](../assets/plan.pdf#page=2)\r\n\x60${href}\x60\r\n`
    await fs.writeFile(path.join(root, "notes/a.markdown"), body)
    await fs.writeFile(path.join(root, "notes/b.md"), `![shared](${href})`)
    const plan = await prepareMarkdownLinkMove(
      root,
      "notes/a.markdown",
      "notes/deep/a.markdown"
    )
    await fs.rename(
      path.join(root, "notes/a.markdown"),
      path.join(root, "notes/deep/a.markdown")
    )
    expect(await applyMarkdownLinkMove(root, plan)).toEqual({
      updatedPaths: ["notes/deep/a.markdown"],
      skippedPaths: [],
    })
    const saved = await fs.readFile(
      path.join(root, "notes/deep/a.markdown"),
      "utf8"
    )
    expect(saved).toBe(
      body
        .replace(`](${href}`, `](../../assets/${encodeURIComponent(name)}`)
        .replace("](../assets/plan.pdf", "](../../assets/plan.pdf")
    )
    for (const [owner, url] of [
      [
        "notes/deep/a.markdown",
        `../../assets/${encodeURIComponent(name)}?v=1#view`,
      ],
      ["notes/b.md", href],
    ])
      expect(
        await resolveMarkdownDocumentImage(root, owner!, url!)
      ).toMatchObject({ relativePath: `assets/${name}` })
    expect(
      await resolveMarkdownDocumentLink(
        root,
        "notes/deep/a.markdown",
        "../../assets/plan.pdf?download=1#page=2"
      )
    ).toMatchObject({ relativePath: "assets/plan.pdf" })
    expect(await fs.readFile(path.join(root, "assets", name))).toEqual(
      Buffer.from(PNG)
    )
    expect(await fs.readdir(path.join(root, "assets"))).toEqual(
      expect.arrayContaining([name, "plan.pdf"])
    )
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

it("keeps explicit body links exact and rejects unsafe paths without loosening ordinary FileEntry assets", async () => {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-body-boundary-"))
  )
  try {
    await fs.mkdir(path.join(root, "notes/deep"), { recursive: true })
    await fs.mkdir(path.join(root, "assets"))
    await fs.mkdir(path.join(root, ".git"))
    await fs.mkdir(path.join(root, ".eidos"))
    await fs.writeFile(path.join(root, ".eidos/files.eidos"), "catalog owner")
    await fs.writeFile(path.join(root, "notes/deep/a.md"), "body")
    await fs.writeFile(path.join(root, "notes/data.eidos"), "synthetic owner")
    await fs.writeFile(path.join(root, "assets/photo.png"), PNG)
    await fs.writeFile(path.join(root, ".git/secret.png"), PNG)
    await fs.symlink(path.join(root, "assets"), path.join(root, "alias"))
    for (const href of ["./photo.png", "../photo.png"])
      expect(
        await resolveMarkdownDocumentImage(root, "notes/deep/a.md", href)
      ).toBeNull()
    expect(
      await resolveMarkdownDocumentImage(
        root,
        "notes/data.eidos",
        "../assets/photo.png"
      )
    ).toMatchObject({ relativePath: "assets/photo.png" })
    await expect(
      resolveMarkdownDocumentLink(
        root,
        "notes/deep/a.md",
        "../../.git/secret.png"
      )
    ).rejects.toThrow()
    for (const href of ["../../alias/photo.png", "../../../outside.png"])
      expect(
        await resolveMarkdownDocumentLink(root, "notes/deep/a.md", href)
      ).toBeNull()
    for (const href of [
      "../assets%2fphoto.png",
      "%2e%2e/assets/photo.png",
      "../bad%00.png",
      "file:///tmp/photo.png",
      "C:/photo.png",
      "//host/photo.png",
    ])
      await expect(
        resolveMarkdownDocumentImage(root, "notes/data.eidos", href)
      ).rejects.toThrow()
    expect(eidosFileUriClass("../assets/photo.png")).toBeNull()
    await expect(
      resolveMarkdownDocumentImage(
        root,
        ".eidos/files.eidos",
        "../assets/photo.png"
      )
    ).rejects.toThrow("Internal Space files")
    await expect(
      resolveEidosFileAttachment(
        root,
        ".eidos/files.eidos",
        {
          id: "fixture",
          name: "photo.png",
          size: String(PNG.length),
          mediaType: "image/png",
          uri: "../assets/photo.png",
        },
        "preview"
      )
    ).rejects.toThrow()
    await expect(
      resolveEidosFileAttachment(
        root,
        "notes/data.eidos",
        {
          id: "fixture",
          name: "photo.png",
          size: String(PNG.length),
          mediaType: "image/png",
          uri: "../assets/photo.png",
        },
        "preview"
      )
    ).rejects.toThrow()
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

it("admits an explicit ordinary body attachment to the Host open action only after owner, root and real-path checks", async () => {
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-body-open-"))
  )
  const root = path.join(directory, "Space")
  await fs.mkdir(path.join(root, "notes"), { recursive: true })
  await fs.mkdir(path.join(root, "assets"))
  await fs.writeFile(
    path.join(root, "notes/a.md"),
    "[plan](../assets/plan.pdf)"
  )
  await fs.writeFile(path.join(root, "assets/plan.pdf"), "%PDF-1.4 synthetic")
  await fs.symlink(
    path.join(root, "assets/plan.pdf"),
    path.join(root, "assets/alias.pdf")
  )
  const session = await SpaceSession.create(
    root,
    path.join(directory, "state"),
    {
      graft: {
        backend: "sdk",
        expectedVersion: () => "test",
        hasOpenSession: () => false,
        close: async () => {},
      } as never,
    }
  )
  const activate = vi.fn(async (_relativePath: string) => {})
  try {
    await session.openMarkdownLink(
      "notes/a.md",
      "../assets/plan.pdf?download=1#page=2",
      activate
    )
    expect(activate).toHaveBeenCalledExactlyOnceWith("assets/plan.pdf")
    for (const href of [
      "../assets/alias.pdf",
      "../absent.pdf",
      "../../outside.pdf",
    ])
      await expect(
        session.openMarkdownLink("notes/a.md", href, activate)
      ).rejects.toThrow()
    expect(activate).toHaveBeenCalledTimes(1)
  } finally {
    await session.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
})
