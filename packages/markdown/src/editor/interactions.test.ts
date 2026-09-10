import { resolveEditorInteractions } from "./interactions"

describe("editor interaction defaults", () => {
  it("preserves legacy toolbar and marquee behavior", () => {
    expect(resolveEditorInteractions(undefined)).toEqual({
      toolbar: true,
      insertMenu: true,
      blockDrag: true,
      blockSelection: true,
      collapsibleHeadings: true,
    })
    expect(resolveEditorInteractions(undefined, false)).toEqual({
      toolbar: false,
      insertMenu: false,
      blockDrag: false,
      blockSelection: true,
      collapsibleHeadings: true,
    })
  })
  it("lets explicit switches override legacy values independently", () => {
    expect(
      resolveEditorInteractions(
        { insertMenu: true, blockSelection: false },
        false
      )
    ).toEqual({
      toolbar: false,
      insertMenu: true,
      blockDrag: false,
      blockSelection: false,
      collapsibleHeadings: true,
    })
    expect(
      resolveEditorInteractions({ toolbar: false, blockDrag: false })
    ).toEqual({
      toolbar: false,
      insertMenu: true,
      blockDrag: false,
      blockSelection: true,
      collapsibleHeadings: true,
    })
  })
})
