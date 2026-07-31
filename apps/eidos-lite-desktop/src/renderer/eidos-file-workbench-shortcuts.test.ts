import { shouldFocusEidosFileSearch } from "./eidos-file-workbench-shortcuts"

function shortcutEvent(
  overrides: Partial<Parameters<typeof shouldFocusEidosFileSearch>[0]> = {}
) {
  return {
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    key: "f",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  }
}

describe("Eidos File workbench shortcuts", () => {
  it("focuses table search for Command/Ctrl+F inside the active editor", () => {
    const activeElement = {} as Element
    const editor = {
      contains: (candidate: Node | null) => candidate === activeElement,
    } as unknown as HTMLElement

    expect(
      shouldFocusEidosFileSearch(
        shortcutEvent({ metaKey: true }),
        editor,
        activeElement
      )
    ).toBe(true)
    expect(
      shouldFocusEidosFileSearch(
        shortcutEvent({ ctrlKey: true }),
        editor,
        activeElement
      )
    ).toBe(true)
  })

  it("leaves browser find and modified shortcuts alone outside the editor", () => {
    const activeElement = {} as Element
    const editor = {
      contains: (candidate: Node | null) => candidate === editor,
    } as unknown as HTMLElement

    expect(
      shouldFocusEidosFileSearch(
        shortcutEvent({ metaKey: true }),
        editor,
        activeElement
      )
    ).toBe(false)
    expect(
      shouldFocusEidosFileSearch(
        shortcutEvent({ metaKey: true, shiftKey: true }),
        editor,
        editor
      )
    ).toBe(false)
    expect(
      shouldFocusEidosFileSearch(
        shortcutEvent({ ctrlKey: true, altKey: true }),
        editor,
        editor
      )
    ).toBe(false)
    expect(
      shouldFocusEidosFileSearch(
        shortcutEvent({ metaKey: true, defaultPrevented: true }),
        editor,
        editor
      )
    ).toBe(false)
  })
})
