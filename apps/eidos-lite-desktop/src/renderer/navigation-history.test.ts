import { describe, expect, it } from "vitest"

import {
  createNavigationHistory,
  navigationAtOffset,
  pushNavigationLocation,
  removeNavigationPathPrefix,
  replaceNavigationPathPrefix,
} from "./navigation-history"

describe("Eidos Lite document navigation history", () => {
  it("branches after going back and skips duplicate locations", () => {
    let history = createNavigationHistory()
    history = pushNavigationLocation(history, "notes/one.md")
    history = pushNavigationLocation(history, "notes/two.md")
    history = pushNavigationLocation(history, "notes/two.md")

    expect(history.entries).toEqual([null, "notes/one.md", "notes/two.md"])
    expect(navigationAtOffset(history, -1)).toEqual({
      index: 1,
      location: "notes/one.md",
    })

    history = { ...history, index: 1 }
    history = pushNavigationLocation(history, "notes/three.md")
    expect(history).toEqual({
      entries: [null, "notes/one.md", "notes/three.md"],
      index: 2,
    })
    expect(navigationAtOffset(history, 1)).toBeNull()
  })

  it("keeps history valid when files and folders move", () => {
    const history = {
      entries: [
        null,
        "projects/plan.eidos",
        "projects/archive/notes.md",
        "README.md",
      ],
      index: 2,
    }

    expect(
      replaceNavigationPathPrefix(history, "projects", "work/projects")
    ).toEqual({
      entries: [
        null,
        "work/projects/plan.eidos",
        "work/projects/archive/notes.md",
        "README.md",
      ],
      index: 2,
    })
    expect(removeNavigationPathPrefix(history, "projects/archive")).toEqual({
      entries: [null, "projects/plan.eidos", "README.md"],
      index: 1,
    })
  })
})
