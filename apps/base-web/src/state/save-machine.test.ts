import {
  canSaveToOriginal,
  hasUnsavedChanges,
  initialSaveState,
  saveReducer,
} from "./save-machine"

describe("saveReducer", () => {
  it("moves committed edits through dirty, saving and saved", () => {
    let state = saveReducer(initialSaveState, {
      type: "OPEN_SUCCESS",
      mode: "direct",
      permission: "granted",
    })
    state = saveReducer(state, { type: "MUTATION_COMMITTED" })
    expect(state.phase).toBe("dirty")
    expect(hasUnsavedChanges(state)).toBe(true)

    state = saveReducer(state, { type: "SAVE_START" })
    expect(state.phase).toBe("saving")
    state = saveReducer(state, { type: "SAVE_SUCCESS", at: 42 })
    expect(state.phase).toBe("saved")
    expect(state.lastSavedAt).toBe(42)
    expect(hasUnsavedChanges(state)).toBe(false)
  })

  it("keeps failed and conflicted working copies dirty", () => {
    const opened = saveReducer(initialSaveState, {
      type: "OPEN_SUCCESS",
      mode: "direct",
      permission: "granted",
    })
    const dirty = saveReducer(opened, { type: "MUTATION_COMMITTED" })
    const failed = saveReducer(dirty, {
      type: "SAVE_FAILURE",
      message: "Disk full",
    })
    expect(hasUnsavedChanges(failed)).toBe(true)
    expect(failed.error).toBe("Disk full")

    const conflict = saveReducer(failed, {
      type: "CONFLICT",
      message: "File changed outside Eidos",
    })
    expect(conflict.phase).toBe("conflict")
    expect(hasUnsavedChanges(conflict)).toBe(true)
  })

  it("does not claim copy mode can save to the original", () => {
    const copy = saveReducer(initialSaveState, {
      type: "OPEN_SUCCESS",
      mode: "copy",
      permission: "denied",
    })
    expect(canSaveToOriginal(copy)).toBe(false)
    const directReadOnly = saveReducer(initialSaveState, {
      type: "OPEN_SUCCESS",
      mode: "direct",
      permission: "denied",
    })
    expect(canSaveToOriginal(directReadOnly)).toBe(false)
  })

  it("marks a migrated working copy dirty on open", () => {
    const state = saveReducer(initialSaveState, {
      type: "OPEN_SUCCESS",
      mode: "direct",
      permission: "granted",
      dirty: true,
    })
    expect(state.phase).toBe("dirty")
  })
})
