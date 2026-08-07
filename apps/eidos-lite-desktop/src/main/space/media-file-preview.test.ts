import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  detectMediaFileType,
  issueMediaPreviewUrl,
  serveMediaPreview,
} from "./media-file-preview"

describe("detectMediaFileType", () => {
  it("recognizes browser-native media by extension, case-insensitively", () => {
    expect(detectMediaFileType("assets/logo.png")).toEqual({
      mediaKind: "image",
      mimeType: "image/png",
    })
    expect(detectMediaFileType("clips/Intro.MP4")).toEqual({
      mediaKind: "video",
      mimeType: "video/mp4",
    })
    expect(detectMediaFileType("audio/notes.m4a")).toEqual({
      mediaKind: "audio",
      mimeType: "audio/mp4",
    })
  })

  it("leaves unknown extensions and editable text formats alone", () => {
    expect(detectMediaFileType("archive.zip")).toBeUndefined()
    expect(detectMediaFileType("icon.svg")).toBeUndefined()
    expect(detectMediaFileType("notes.md")).toBeUndefined()
  })
})

describe("serveMediaPreview", () => {
  async function withTempRoot(
    run: (root: string) => Promise<void>
  ): Promise<void> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-media-"))
    try {
      await run(root)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  }

  it("streams the whole file with its mime type", async () => {
    await withTempRoot(async (root) => {
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
      await fs.writeFile(path.join(root, "pixel.png"), bytes)
      const url = issueMediaPreviewUrl(root, "pixel.png", "image/png")

      const response = await serveMediaPreview(url, new Headers())
      expect(response.status).toBe(200)
      expect(response.headers.get("Content-Type")).toBe("image/png")
      expect(response.headers.get("Content-Length")).toBe(String(bytes.length))
      expect(response.headers.get("Accept-Ranges")).toBe("bytes")
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes)
    })
  })

  it("answers range requests so video playback can seek", async () => {
    await withTempRoot(async (root) => {
      const bytes = Buffer.from("0123456789", "utf8")
      await fs.writeFile(path.join(root, "clip.mp4"), bytes)
      const url = issueMediaPreviewUrl(root, "clip.mp4", "video/mp4")

      const response = await serveMediaPreview(
        url,
        new Headers({ Range: "bytes=2-5" })
      )
      expect(response.status).toBe(206)
      expect(response.headers.get("Content-Range")).toBe("bytes 2-5/10")
      expect(response.headers.get("Content-Length")).toBe("4")
      expect(Buffer.from(await response.arrayBuffer())).toEqual(
        Buffer.from("2345", "utf8")
      )

      const open = await serveMediaPreview(
        url,
        new Headers({ Range: "bytes=8-" })
      )
      expect(open.status).toBe(206)
      expect(open.headers.get("Content-Range")).toBe("bytes 8-9/10")

      const unsatisfiable = await serveMediaPreview(
        url,
        new Headers({ Range: "bytes=42-" })
      )
      expect(unsatisfiable.status).toBe(416)
    })
  })

  it("rejects unknown tokens and tampered URLs", async () => {
    await withTempRoot(async (root) => {
      await fs.writeFile(path.join(root, "pixel.png"), Buffer.from([0x89]))
      expect(
        (
          await serveMediaPreview(
            "eidos-space-media://preview/not-a-real-token",
            new Headers()
          )
        ).status
      ).toBe(404)
      expect(
        (
          await serveMediaPreview(
            "eidos-space-media://other-host/abc",
            new Headers()
          )
        ).status
      ).toBe(404)
      expect(
        (await serveMediaPreview("https://preview/abc", new Headers())).status
      ).toBe(404)
      expect(
        (
          await serveMediaPreview(
            "eidos-space-media://preview/a/b",
            new Headers()
          )
        ).status
      ).toBe(404)
    })
  })

  it("stops serving a preview whose file was replaced by a symlink", async () => {
    await withTempRoot(async (root) => {
      const target = path.join(root, "pixel.png")
      await fs.writeFile(target, Buffer.from([0x89, 0x50]))
      const url = issueMediaPreviewUrl(root, "pixel.png", "image/png")
      expect((await serveMediaPreview(url, new Headers())).status).toBe(200)

      await fs.rm(target)
      await fs.symlink(path.join(os.tmpdir(), "elsewhere.png"), target)
      expect((await serveMediaPreview(url, new Headers())).status).toBe(404)
    })
  })

  it("stops serving a preview whose file was deleted", async () => {
    await withTempRoot(async (root) => {
      const target = path.join(root, "pixel.png")
      await fs.writeFile(target, Buffer.from([0x89]))
      const url = issueMediaPreviewUrl(root, "pixel.png", "image/png")
      await fs.rm(target)
      expect((await serveMediaPreview(url, new Headers())).status).toBe(404)
    })
  })
})
