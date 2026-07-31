import { describe, expect, it } from "vitest"

import { fileTitlebarPresentation } from "./file-titlebar-presentation"

describe("fileTitlebarPresentation", () => {
  it("shows the requested file throughout an asynchronous switch", () => {
    expect(
      fileTitlebarPresentation("My Space", "previous.eidos", "images/next.jpg")
    ).toEqual({
      documentPath: "images/next.jpg",
      title: "next.jpg",
      detail: "images/next.jpg",
      pending: true,
    })
  })

  it("keeps a stable detail row for root files without duplicating the name", () => {
    expect(fileTitlebarPresentation("My Space", "notes.eidos", null)).toEqual({
      documentPath: "notes.eidos",
      title: "notes.eidos",
      detail: null,
      pending: false,
    })
  })

  it("falls back to the Space name only when no document is active or pending", () => {
    expect(fileTitlebarPresentation("My Space", null, null)).toEqual({
      documentPath: null,
      title: "My Space",
      detail: null,
      pending: false,
    })
  })
})
