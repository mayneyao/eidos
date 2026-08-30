import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  eidosFileAssetDirectory,
  importEidosFileAttachmentData,
  importEidosFileAttachments,
  portableEidosFileAssetName,
  resolveEidosFileAttachment,
} from "./eidos-file-attachments"

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
])

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-assets-"))
  await fs.mkdir(path.join(root, "project"))
  await fs.writeFile(path.join(root, "project", "data.eidos"), "fixture")
  return fs.realpath(root)
}

describe("Eidos Lite attachment files", () => {
  it("creates portable names without Windows reserved components", () => {
    expect(portableEidosFileAssetName(" CON.txt ")).toBe("_CON.txt")
    expect(portableEidosFileAssetName("report:final?.pdf")).toBe(
      "report_final_.pdf"
    )
  })

  it("imports visible files next to a nested Eidos File with canonical entries", async () => {
    const root = await fixture()
    const source = path.join(root, "photo.png")
    await fs.writeFile(source, PNG)
    const first = await importEidosFileAttachments(root, "project/data.eidos", [
      source,
    ])
    const second = await importEidosFileAttachments(
      root,
      "project/data.eidos",
      [source]
    )

    expect(first.entries[0]).toMatchObject({
      uri: "assets/photo.png",
      name: "photo.png",
      mediaType: "image/png",
      size: String(PNG.byteLength),
    })
    expect(second.entries[0]?.uri).toBe("assets/photo%20(2).png")
    await expect(
      fs.readFile(path.join(root, "project", "assets", "photo.png"))
    ).resolves.toEqual(Buffer.from(PNG))
  })

  it("attaches an existing managed asset in place without making a copy", async () => {
    const root = await fixture()
    const assetRoot = await eidosFileAssetDirectory(root, "project/data.eidos")
    const existing = path.join(assetRoot, "existing.png")
    await fs.writeFile(existing, PNG)

    const attached = await importEidosFileAttachments(
      root,
      "project/data.eidos",
      [existing]
    )

    expect(attached.entries[0]).toMatchObject({
      uri: "assets/existing.png",
      name: "existing.png",
      mediaType: "image/png",
      size: String(PNG.byteLength),
    })
    await expect(fs.readdir(assetRoot)).resolves.toEqual(["existing.png"])
  })

  it("imports clipboard-style bytes with sniffed media types and fallback names", async () => {
    const root = await fixture()
    const first = await importEidosFileAttachmentData(
      root,
      "project/data.eidos",
      [
        { name: "image.png", data: PNG },
        { name: "", data: PNG },
      ]
    )
    const second = await importEidosFileAttachmentData(
      root,
      "project/data.eidos",
      [{ name: "image.png", data: PNG }]
    )

    expect(first.entries[0]).toMatchObject({
      uri: "assets/image.png",
      name: "image.png",
      mediaType: "image/png",
      size: String(PNG.byteLength),
    })
    expect(first.entries[1]).toMatchObject({
      uri: "assets/attachment",
      name: "attachment",
      mediaType: "image/png",
    })
    expect(second.entries[0]?.uri).toBe("assets/image%20(2).png")
    await expect(
      fs.readFile(path.join(root, "project", "assets", "image.png"))
    ).resolves.toEqual(Buffer.from(PNG))
  })

  it("replaces generic pasted image names with stable timestamped names", async () => {
    const root = await fixture()
    const now = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.UTC(2026, 7, 30, 1, 2, 3, 456))
    try {
      const imported = await importEidosFileAttachmentData(
        root,
        "project/data.eidos",
        [
          { name: "diagram.png", data: PNG, source: "paste" },
          { name: "image (1).png", data: PNG, source: "paste" },
          { name: "", data: PNG, source: "paste" },
          { name: "image.png", data: PNG, source: "drop" },
        ]
      )

      expect(imported.entries.map((entry) => entry.name)).toEqual([
        "diagram.png",
        "pasted-image-20260830-010203-456.png",
        "pasted-image-20260830-010203-456-2.png",
        "image.png",
      ])
      expect(imported.entries.map((entry) => entry.uri)).toEqual([
        "assets/diagram.png",
        "assets/pasted-image-20260830-010203-456.png",
        "assets/pasted-image-20260830-010203-456-2.png",
        "assets/image.png",
      ])
    } finally {
      now.mockRestore()
    }
  })

  it("rejects clipboard imports above the count limit", async () => {
    const root = await fixture()
    await expect(
      importEidosFileAttachmentData(
        root,
        "project/data.eidos",
        Array.from({ length: 65 }, (_, index) => ({
          name: `paste-${index}.png`,
          data: PNG,
        }))
      )
    ).rejects.toThrow("Choose between 1 and 64 attachments")
  })

  it("resolves verified raster thumbnails and rejects metadata drift", async () => {
    const root = await fixture()
    const source = path.join(root, "photo.png")
    await fs.writeFile(source, PNG)
    const imported = await importEidosFileAttachments(
      root,
      "project/data.eidos",
      [source]
    )
    const entry = imported.entries[0]!

    await expect(
      resolveEidosFileAttachment(root, "project/data.eidos", entry, "thumbnail")
    ).resolves.toMatchObject({ bytes: PNG })

    await fs.appendFile(
      path.join(root, "project", "assets", "photo.png"),
      "changed"
    )
    await expect(
      resolveEidosFileAttachment(root, "project/data.eidos", entry, "preview")
    ).rejects.toThrow("no longer matches")
  })

  it("resolves safe equivalent percent encodings produced by other hosts", async () => {
    const root = await fixture()
    const source = path.join(root, "photo.png")
    await fs.writeFile(source, PNG)
    await importEidosFileAttachments(root, "project/data.eidos", [source])
    const imported = await importEidosFileAttachments(
      root,
      "project/data.eidos",
      [source]
    )
    const entry = imported.entries[0]!

    await expect(
      resolveEidosFileAttachment(
        root,
        "project/data.eidos",
        {
          ...entry,
          uri: entry.uri.replace("(2)", "%282%29"),
        },
        "thumbnail"
      )
    ).resolves.toMatchObject({ bytes: PNG })
  })

  it("rejects encoded traversal and path separators while resolving assets", async () => {
    const root = await fixture()
    const source = path.join(root, "photo.png")
    await fs.writeFile(source, PNG)
    const imported = await importEidosFileAttachments(
      root,
      "project/data.eidos",
      [source]
    )
    const entry = imported.entries[0]!

    for (const uri of [
      "assets/%2E%2E/photo.png",
      "assets/folder%2Fphoto.png",
      "assets//photo.png",
    ]) {
      await expect(
        resolveEidosFileAttachment(
          root,
          "project/data.eidos",
          { ...entry, uri },
          "thumbnail"
        )
      ).rejects.toThrow(/Attachment URI/)
    }
  })

  it("rejects symlink attachment sources", async () => {
    if (process.platform === "win32") return
    const root = await fixture()
    const source = path.join(root, "photo.png")
    const linked = path.join(root, "linked.png")
    await fs.writeFile(source, PNG)
    await fs.symlink(source, linked)

    await expect(
      importEidosFileAttachments(root, "project/data.eidos", [linked])
    ).rejects.toThrow("ordinary files")
  })

  it("rejects attachment resolution through a symlink directory", async () => {
    if (process.platform === "win32") return
    const root = await fixture()
    const source = path.join(root, "photo.png")
    await fs.writeFile(source, PNG)
    const imported = await importEidosFileAttachments(
      root,
      "project/data.eidos",
      [source]
    )
    await fs.rename(path.join(root, "project"), path.join(root, "project-real"))
    await fs.symlink(
      path.join(root, "project-real"),
      path.join(root, "project")
    )

    await expect(
      resolveEidosFileAttachment(
        root,
        "project/data.eidos",
        imported.entries[0]!,
        "preview"
      )
    ).rejects.toThrow("attachment root cannot be a symlink")
  })
})
