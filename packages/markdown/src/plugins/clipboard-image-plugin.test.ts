import { pastedImageData } from "./clipboard-image-plugin"

describe("clipboard image resources", () => {
  const file = new File(["image"], "diagram.png", { type: "image/png" })

  it("creates a canonical image block while keeping the display URL transient", () => {
    expect(
      pastedImageData(
        {
          markdownUrl: "opfs://markdown-editor-playground/images/asset.png",
          displayUrl: "blob:https://example.com/preview",
          alt: "A ] diagram",
          title: 'A "title"',
        },
        file
      )
    ).toEqual({
      kind: "image",
      source:
        '![A \\] diagram](<opfs://markdown-editor-playground/images/asset.png> "A \\"title\\"")',
      url: "opfs://markdown-editor-playground/images/asset.png",
      resolvedUrl: "blob:https://example.com/preview",
      alt: "A ] diagram",
      title: 'A "title"',
    })
  })

  it("uses the clipboard file name as accessible fallback text", () => {
    expect(
      pastedImageData({ markdownUrl: "https://eidos.space/diagram.png" }, file)
    ).toMatchObject({
      alt: "diagram.png",
      resolvedUrl: "https://eidos.space/diagram.png",
      source: "![diagram.png](<https://eidos.space/diagram.png>)",
    })
  })

  it.each([
    "",
    "data:image/png;base64,unsafe",
    "file:///tmp/private.png",
    "opfs://images/<invalid>.png",
  ])("rejects an unsafe canonical destination: %s", (markdownUrl) => {
    expect(() => pastedImageData({ markdownUrl }, file)).toThrow(
      /non-empty, non-dangerous/u
    )
  })

  it("rejects an unsafe host presentation URL", () => {
    expect(() =>
      pastedImageData(
        {
          markdownUrl: "opfs://images/asset.png",
          displayUrl: "data:image/png;base64,unsafe",
        },
        file
      )
    ).toThrow(/blob, http, or https/u)
  })
})
