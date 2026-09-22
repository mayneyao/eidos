import { describe, expect, it } from "vitest"

import { fileTitlebarPresentation } from "./file-titlebar-presentation"

describe("fileTitlebarPresentation", () => {
  it("prefixes the active editor while keeping the original file identity", () => {
    expect(
      fileTitlebarPresentation("Space", "folder/requests.eidos", null, {
        documentPath: "folder/requests.eidos",
        label: "Smart Actions",
      })
    ).toEqual({
      documentPath: "folder/requests.eidos",
      title: "Smart Actions:\\requests.eidos",
      pending: false,
    })
    for (const label of ["Source", "Rich text"]) {
      expect(
        fileTitlebarPresentation("Space", "note.md", null, {
          documentPath: "note.md",
          label,
        }).title
      ).toBe(`${label}:\\note.md`)
    }
  })
  it("does not carry an editor label into another or pending document", () => {
    const editor = { documentPath: "old.eidos", label: "Smart Actions" }
    expect(
      fileTitlebarPresentation("Space", "new.eidos", null, editor).title
    ).toBe("new.eidos")
    expect(
      fileTitlebarPresentation("Space", "old.eidos", "new.eidos", editor).title
    ).toBe("new.eidos")
  })
  it("shows the requested file throughout an asynchronous switch", () => {
    expect(
      fileTitlebarPresentation("My Space", "previous.eidos", "images/next.jpg")
    ).toEqual({
      documentPath: "images/next.jpg",
      title: "next.jpg",
      pending: true,
    })
  })

  it("shows only the file name for a root file", () => {
    expect(fileTitlebarPresentation("My Space", "notes.eidos", null)).toEqual({
      documentPath: "notes.eidos",
      title: "notes.eidos",
      pending: false,
    })
  })

  it("falls back to the Space name only when no document is active or pending", () => {
    expect(fileTitlebarPresentation("My Space", null, null)).toEqual({
      documentPath: null,
      title: "My Space",
      pending: false,
    })
  })
})
