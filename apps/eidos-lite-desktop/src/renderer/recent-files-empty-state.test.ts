import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { RecentFilesEmptyState } from "./recent-files-empty-state"

describe("RecentFilesEmptyState", () => {
  it("renders a compact recent-file list without runtime implementation copy", () => {
    const markup = renderToStaticMarkup(
      createElement(RecentFilesEmptyState, {
        files: [
          {
            relativePath: "docs/notes.md",
            name: "notes.md",
            kind: "file",
          },
          {
            relativePath: "project.eidos",
            name: "project.eidos",
            kind: "eidos",
          },
        ],
        busyPath: null,
        onOpen: () => undefined,
      })
    )

    expect(markup).toContain("data-recent-files-empty-state")
    expect(markup).toContain('data-recent-file-path="docs/notes.md"')
    expect(markup).toContain("notes.md")
    expect(markup).toContain("project.eidos")
    expect(markup).not.toContain("runtime cache")
  })

  it("uses a non-technical fallback before any file has been opened", () => {
    const markup = renderToStaticMarkup(
      createElement(RecentFilesEmptyState, {
        files: [],
        busyPath: null,
        onOpen: () => undefined,
      })
    )

    expect(markup).toContain("Recent files")
    expect(markup).toContain("Open a file from the Space Explorer")
  })
})
