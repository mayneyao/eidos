import {
  matchesMarkdownShortcut,
  resolveMarkdownShortcuts,
} from "../shortcuts/shortcut-registry"
import {
  applySourceTextareaCommand,
  sourceTextareaCommandForEvent,
} from "./source-textarea-shortcuts"

describe("source textarea shortcuts", () => {
  it("toggles Markdown bold and italic markers around selected text", () => {
    const plain = { value: "alpha", selectionStart: 0, selectionEnd: 5 }
    const bold = applySourceTextareaCommand(plain, "toggle-bold")
    expect(bold).toEqual({
      value: "**alpha**",
      selectionStart: 2,
      selectionEnd: 7,
    })

    const boldItalic = applySourceTextareaCommand(bold, "toggle-italic")
    expect(boldItalic).toEqual({
      value: "***alpha***",
      selectionStart: 3,
      selectionEnd: 8,
    })
    expect(applySourceTextareaCommand(boldItalic, "toggle-italic")).toEqual(
      bold
    )
    expect(applySourceTextareaCommand(bold, "toggle-bold")).toEqual(plain)
  })

  it("unwraps selected Markdown markers and inserts paired markers at a caret", () => {
    expect(
      applySourceTextareaCommand(
        { value: "**alpha**", selectionStart: 0, selectionEnd: 9 },
        "toggle-bold"
      )
    ).toEqual({ value: "alpha", selectionStart: 0, selectionEnd: 5 })

    const inserted = applySourceTextareaCommand(
      { value: "alpha", selectionStart: 5, selectionEnd: 5 },
      "toggle-bold"
    )
    expect(inserted).toEqual({
      value: "alpha****",
      selectionStart: 7,
      selectionEnd: 7,
    })
    expect(applySourceTextareaCommand(inserted, "toggle-bold")).toEqual({
      value: "alpha",
      selectionStart: 5,
      selectionEnd: 5,
    })
  })

  it("inserts two spaces at a caret and indents selected lines", () => {
    expect(
      applySourceTextareaCommand(
        { value: "alpha", selectionStart: 2, selectionEnd: 2 },
        "indent"
      )
    ).toEqual({ value: "al  pha", selectionStart: 4, selectionEnd: 4 })

    expect(
      applySourceTextareaCommand(
        { value: "one\ntwo\nthree", selectionStart: 0, selectionEnd: 8 },
        "indent"
      )
    ).toEqual({
      value: "  one\n  two\nthree",
      selectionStart: 2,
      selectionEnd: 12,
    })
  })

  it("outdents tabs or up to two spaces without normalizing line endings", () => {
    expect(
      applySourceTextareaCommand(
        {
          value: "  one\r\n\ttwo\r\nthree",
          selectionStart: 0,
          selectionEnd: 14,
        },
        "outdent"
      )
    ).toEqual({
      value: "one\r\ntwo\r\nthree",
      selectionStart: 0,
      selectionEnd: 11,
    })
  })

  it("moves one or more lines while retaining the caret or selection", () => {
    expect(
      applySourceTextareaCommand(
        { value: "one\r\ntwo\r\nthree", selectionStart: 6, selectionEnd: 6 },
        "move-line-up"
      )
    ).toEqual({
      value: "two\r\none\r\nthree",
      selectionStart: 1,
      selectionEnd: 1,
    })

    expect(
      applySourceTextareaCommand(
        { value: "one\nTWO\nthree", selectionStart: 4, selectionEnd: 8 },
        "move-line-down"
      )
    ).toEqual({
      value: "one\nthree\nTWO",
      selectionStart: 10,
      selectionEnd: 13,
    })
  })

  it("does not move lines beyond the source boundaries", () => {
    const state = { value: "one\ntwo", selectionStart: 1, selectionEnd: 1 }
    expect(applySourceTextareaCommand(state, "move-line-up")).toEqual(state)
  })

  it("copies lines above or below and keeps the original selection", () => {
    expect(
      applySourceTextareaCommand(
        { value: "one\ntwo", selectionStart: 5, selectionEnd: 5 },
        "copy-line-down"
      )
    ).toEqual({
      value: "one\ntwo\ntwo",
      selectionStart: 5,
      selectionEnd: 5,
    })
    expect(
      applySourceTextareaCommand(
        { value: "one\ntwo", selectionStart: 5, selectionEnd: 5 },
        "copy-line-up"
      )
    ).toEqual({
      value: "one\ntwo\ntwo",
      selectionStart: 9,
      selectionEnd: 9,
    })
  })

  it("deletes complete lines and selects the current line", () => {
    expect(
      applySourceTextareaCommand(
        { value: "one\ntwo\nthree", selectionStart: 5, selectionEnd: 5 },
        "delete-line"
      )
    ).toEqual({ value: "one\nthree", selectionStart: 4, selectionEnd: 4 })
    expect(
      applySourceTextareaCommand(
        { value: "one\ntwo", selectionStart: 5, selectionEnd: 5 },
        "delete-line"
      )
    ).toEqual({ value: "one", selectionStart: 3, selectionEnd: 3 })
    expect(
      applySourceTextareaCommand(
        { value: "one\ntwo\nthree", selectionStart: 5, selectionEnd: 5 },
        "select-line"
      )
    ).toEqual({
      value: "one\ntwo\nthree",
      selectionStart: 4,
      selectionEnd: 8,
    })
  })

  it("resolves commands through the overridable shortcut registry", () => {
    const shortcuts = resolveMarkdownShortcuts()
    const matches = (
      event: Parameters<typeof matchesMarkdownShortcut>[0],
      id: string
    ) => matchesMarkdownShortcut(event, id, shortcuts)

    expect(
      sourceTextareaCommandForEvent(
        {
          altKey: true,
          ctrlKey: false,
          key: "ArrowDown",
          metaKey: false,
          shiftKey: true,
        },
        matches
      )
    ).toBe("copy-line-down")
    expect(
      sourceTextareaCommandForEvent(
        {
          altKey: false,
          ctrlKey: false,
          key: "Tab",
          metaKey: false,
          shiftKey: false,
        },
        matches
      )
    ).toBe("indent")
    expect(
      sourceTextareaCommandForEvent(
        {
          altKey: false,
          ctrlKey: false,
          key: "b",
          metaKey: true,
          shiftKey: false,
        },
        matches
      )
    ).toBe("toggle-bold")
  })
})
