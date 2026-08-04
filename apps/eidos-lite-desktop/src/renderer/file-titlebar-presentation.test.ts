import { describe, expect, it } from "vitest"

import { fileTitlebarPresentation } from "./file-titlebar-presentation"

describe("fileTitlebarPresentation", () => {
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
