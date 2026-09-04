import {
  extendKeyboardBlockSelection,
  keyboardBlockSelectionIndices,
} from "./block-marquee-selection-plugin"

describe("keyboard block selection", () => {
  it("returns every index between anchor and focus in document order", () => {
    expect(
      keyboardBlockSelectionIndices({ anchorIndex: 2, focusIndex: 0 }, 4)
    ).toEqual([0, 1, 2])
  })

  it("extends and shrinks around a stable anchor", () => {
    const start = { anchorIndex: 1, focusIndex: 1 }
    const down = extendKeyboardBlockSelection(start, 1, 4)
    expect(down).toEqual({ anchorIndex: 1, focusIndex: 2 })
    expect(keyboardBlockSelectionIndices(down, 4)).toEqual([1, 2])

    const backToAnchor = extendKeyboardBlockSelection(down, -1, 4)
    expect(backToAnchor).toEqual({ anchorIndex: 1, focusIndex: 1 })

    const up = extendKeyboardBlockSelection(backToAnchor, -1, 4)
    expect(up).toEqual({ anchorIndex: 1, focusIndex: 0 })
    expect(keyboardBlockSelectionIndices(up, 4)).toEqual([0, 1])
  })

  it("clamps the focus to document boundaries", () => {
    expect(
      extendKeyboardBlockSelection({ anchorIndex: 0, focusIndex: 0 }, -1, 3)
    ).toEqual({ anchorIndex: 0, focusIndex: 0 })
    expect(
      extendKeyboardBlockSelection({ anchorIndex: 2, focusIndex: 2 }, 1, 3)
    ).toEqual({ anchorIndex: 2, focusIndex: 2 })
    expect(
      keyboardBlockSelectionIndices({ anchorIndex: 0, focusIndex: 0 }, 0)
    ).toEqual([])
  })
})
