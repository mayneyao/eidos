// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest"

import {
  canNavigateHistory,
  initializeNavigationHistory,
  navigationHash,
  navigationOffsetForPointerButton,
  parseNavigationHash,
  pathMatchesPrefix,
  pushNavigationLocation,
  readNavigationHistory,
  replaceNavigationLocation,
} from "./navigation-history"

describe("Eidos Lite browser navigation history", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/")
    window.sessionStorage.clear()
  })

  it("encodes the active Space and file in the URL", () => {
    const hash = navigationHash("space/一", "notes/road map.md")

    expect(hash).toBe("#/space/space%2F%E4%B8%80/file/notes%2Froad%20map.md")
    expect(parseNavigationHash(hash)).toEqual({
      spaceId: "space/一",
      location: "notes/road map.md",
    })
    expect(parseNavigationHash("#invalid")).toBeNull()
  })

  it("branches with browser URLs and restores forward availability", () => {
    const spaceId = "space-id"
    let snapshot = initializeNavigationHistory(spaceId)
    expect(snapshot).toMatchObject({ index: 0, length: 1, location: null })
    expect(window.location.hash).toBe(navigationHash(spaceId, null))

    snapshot = pushNavigationLocation(snapshot, spaceId, "notes/one.md")
    const firstEntryState = window.history.state
    snapshot = pushNavigationLocation(snapshot, spaceId, "notes/two.md")
    expect(snapshot).toMatchObject({
      index: 2,
      length: 3,
      location: "notes/two.md",
    })

    window.history.replaceState(
      firstEntryState,
      "",
      navigationHash(spaceId, "notes/one.md")
    )
    snapshot = readNavigationHistory(spaceId)
    expect(snapshot).toMatchObject({
      index: 1,
      length: 3,
      location: "notes/one.md",
    })
    expect(canNavigateHistory(snapshot, -1)).toBe(true)
    expect(canNavigateHistory(snapshot, 1)).toBe(true)

    snapshot = pushNavigationLocation(snapshot, spaceId, "notes/three.md")
    expect(snapshot).toMatchObject({
      index: 2,
      length: 3,
      location: "notes/three.md",
    })
    expect(canNavigateHistory(snapshot, 1)).toBe(false)
    expect(window.location.hash).toBe(navigationHash(spaceId, "notes/three.md"))
  })

  it("replaces a stale route without adding another history entry", () => {
    const spaceId = "space-id"
    let snapshot = initializeNavigationHistory(spaceId)
    snapshot = pushNavigationLocation(snapshot, spaceId, "deleted.eidos")
    const index = snapshot.index

    snapshot = replaceNavigationLocation(snapshot, spaceId, null)

    expect(snapshot).toMatchObject({ index, length: 2, location: null })
    expect(window.location.hash).toBe(navigationHash(spaceId, null))
  })

  it("matches active files within renamed or deleted directories", () => {
    expect(pathMatchesPrefix("projects/plan.eidos", "projects")).toBe(true)
    expect(pathMatchesPrefix("projects-old/plan.eidos", "projects")).toBe(false)
    expect(pathMatchesPrefix(null, "projects")).toBe(false)
  })

  it("maps mouse side buttons to browser history", () => {
    expect(navigationOffsetForPointerButton(3)).toBe(-1)
    expect(navigationOffsetForPointerButton(4)).toBe(1)
    expect(navigationOffsetForPointerButton(0)).toBeNull()
  })
})
