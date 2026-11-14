// @vitest-environment jsdom

import { createMarkdownImageAttachmentHost } from "./markdown-image-attachments"

const createObjectURL = vi.fn()
const revokeObjectURL = vi.fn()

describe("Markdown image attachment host", () => {
  it("uses the real chooser input, cancels without importing, and drops a disposed import result", async () => {
    const importFile = vi.fn(async () => ({
      markdownUrl: "assets/report.pdf",
      relativePath: "notes/assets/report.pdf",
      mediaType: "application/octet-stream",
    }))
    Object.assign(window.eidosLite, { importMarkdownFile: importFile })
    const host = createMarkdownImageAttachmentHost("notes/readme.md")
    const controller = new AbortController()
    const canceled = host.onImportFiles({
      kind: "file",
      signal: controller.signal,
    })
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(input.accept).toBe("")
    input.dispatchEvent(new Event("cancel"))
    await expect(canceled).resolves.toEqual([])
    expect(importFile).not.toHaveBeenCalled()
    const pending = host.onImportFiles({
      kind: "file",
      signal: controller.signal,
    })
    const selected =
      document.querySelector<HTMLInputElement>('input[type="file"]')!
    const file = new File(["%PDF"], "report.pdf")
    Object.defineProperty(selected, "files", { value: [file] })
    selected.dispatchEvent(new Event("change"))
    await Promise.resolve()
    // Persistence may already have completed, but an unmounted document cannot receive it.
    host.dispose()
    await expect(pending).resolves.toEqual([])
    expect(importFile).toHaveBeenCalledWith("notes/readme.md", file)
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
    createObjectURL
      .mockReset()
      .mockReturnValueOnce("blob:pasted")
      .mockReturnValueOnce("blob:resolved")
    revokeObjectURL.mockReset()
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    })
    Object.assign(window, {
      eidosLite: {
        importMarkdownImage: vi.fn(async () => ({
          markdownUrl: "assets/pasted.png",
          relativePath: "notes/assets/pasted.png",
          mediaType: "image/png",
        })),
        resolveMarkdownImage: vi.fn(async () => ({
          relativePath: "notes/assets/existing.png",
          mediaType: "image/png",
          previewUrl: "eidos-space-media://preview/token",
        })),
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(URL, "createObjectURL")
    Reflect.deleteProperty(URL, "revokeObjectURL")
  })

  it("persists pasted files, resolves existing images, and revokes previews", async () => {
    const host = createMarkdownImageAttachmentHost("notes/readme.md")
    const signal = new AbortController().signal
    const file = new File(["png"], "pasted.png", { type: "image/png" })

    await expect(
      host.onPasteImage({
        documentKey: "notes/readme.md",
        file,
        index: 0,
        total: 1,
        signal,
      })
    ).resolves.toEqual({
      markdownUrl: "assets/pasted.png",
      displayUrl: "blob:pasted",
      alt: "pasted.png",
    })
    await expect(
      host.resolveImageUrl({
        documentKey: "notes/readme.md",
        markdownUrl: "assets/pasted.png",
        signal,
      })
    ).resolves.toBe("blob:pasted")
    expect(window.eidosLite.resolveMarkdownImage).not.toHaveBeenCalled()

    vi.mocked(fetch).mockResolvedValue(
      new Response(new Blob(["png"], { type: "image/png" }), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      })
    )
    await expect(
      host.resolveImageUrl({
        documentKey: "notes/readme.md",
        markdownUrl: "assets/existing.png",
        signal,
      })
    ).resolves.toBe("blob:resolved")
    expect(window.eidosLite.resolveMarkdownImage).toHaveBeenCalledWith(
      "notes/readme.md",
      "assets/existing.png"
    )
    expect(fetch).toHaveBeenCalledWith("eidos-space-media://preview/token", {
      signal,
    })

    host.dispose()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pasted")
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:resolved")
  })
})
