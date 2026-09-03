// @vitest-environment jsdom

import { createMarkdownImageAttachmentHost } from "./markdown-image-attachments"

const createObjectURL = vi.fn()
const revokeObjectURL = vi.fn()

describe("Markdown image attachment host", () => {
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
