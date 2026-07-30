import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { TextFilePreview } from "./text-file-preview"

describe("TextFilePreview", () => {
  it("renders bounded text as an explicit read-only preview", () => {
    const markup = renderToStaticMarkup(
      createElement(TextFilePreview, {
        preview: {
          type: "text",
          relativePath: "notes/readme.md",
          content: "first line\nsecond line",
          encoding: "utf-8",
          size: 2_097_200,
          modifiedAtMs: 0,
          truncated: true,
        },
        onReveal: () => undefined,
      })
    )

    expect(markup).toContain('data-text-file-preview="notes/readme.md"')
    expect(markup).toContain('data-text-file-preview-state="text"')
    expect(markup).toContain('data-text-file-preview-truncated="true"')
    expect(markup).toContain("Read-only")
    expect(markup).toContain("2 lines")
    expect(markup).toContain("Showing the first 2 MB")
  })

  it("keeps binary files in-app with a safe fallback", () => {
    const markup = renderToStaticMarkup(
      createElement(TextFilePreview, {
        preview: {
          type: "unavailable",
          relativePath: "assets/image.bin",
          reason: "binary",
          size: 4,
          modifiedAtMs: 0,
        },
        onReveal: () => undefined,
      })
    )

    expect(markup).toContain('data-text-file-preview-state="binary"')
    expect(markup).toContain("Preview unavailable")
    expect(markup).toContain("Reveal in Finder")
  })
})
