import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  isHtmlFile,
  isMarkdownFile,
  issueHtmlPreviewUrl,
  serveDocumentPreview,
} from "./document-file-preview"

describe("document file preview", () => {
  it("serves only the ticketed HTML file with an isolated document policy", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-html-"))
    const html =
      "<!doctype html><script>document.body.textContent='ready'</script>"
    await fs.writeFile(path.join(root, "dashboard.html"), html)
    await fs.writeFile(path.join(root, "styles.css"), "body { color: blue }")
    await fs.writeFile(path.join(root, "secret.txt"), "not part of the preview")
    try {
      const url = issueHtmlPreviewUrl(root, "dashboard.html")
      const response = await serveDocumentPreview(url)

      expect(url).toMatch(/^eidos-space-document:\/\/[\w-]+\/dashboard\.html$/u)
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe(
        "text/html; charset=utf-8"
      )
      expect(response.headers.get("content-security-policy")).toContain(
        "default-src 'self' data: blob: https:"
      )
      expect(response.headers.get("content-security-policy")).toContain(
        "connect-src 'self' https: wss:"
      )
      await expect(response.text()).resolves.toBe(html)

      await expect(
        serveDocumentPreview(new URL("styles.css", url).href)
      ).resolves.toMatchObject({ status: 200 })
      await expect(
        serveDocumentPreview(new URL("secret.txt", url).href)
      ).resolves.toMatchObject({ status: 404 })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("recognizes HTML extensions and refuses linked files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-html-"))
    const outside = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-html-outside-")
    )
    await fs.writeFile(path.join(outside, "outside.html"), "outside")
    await fs.symlink(
      path.join(outside, "outside.html"),
      path.join(root, "linked.html")
    )
    try {
      expect(isHtmlFile("index.HTML")).toBe(true)
      expect(isHtmlFile("archive.htm")).toBe(true)
      expect(isHtmlFile("notes.md")).toBe(false)
      expect(isMarkdownFile("notes.md")).toBe(true)
      expect(isMarkdownFile("README.MARKDOWN")).toBe(true)
      expect(isMarkdownFile("index.html")).toBe(false)

      const response = await serveDocumentPreview(
        issueHtmlPreviewUrl(root, "linked.html")
      )
      expect(response.status).toBe(404)
    } finally {
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(outside, { recursive: true, force: true }),
      ])
    }
  })
})
