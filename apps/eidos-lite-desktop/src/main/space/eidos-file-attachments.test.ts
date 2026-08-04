import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  eidosFileAssetDirectory,
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
