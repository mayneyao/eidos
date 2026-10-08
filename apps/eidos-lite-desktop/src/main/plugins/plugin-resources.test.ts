import { describe, it, expect } from "vitest"
import { resourcePath, resourceRect, resourceSource } from "./plugin-resources"
describe("resource references", () => {
  it("resolves relative to the dashboard while retaining the Space boundary", () => {
    expect(
      resourcePath("dashboards/main.dashboard", "../data/downloads.eidos")
    ).toBe("data/downloads.eidos")
    expect(resourcePath("main.dashboard", "./notes.md")).toBe("notes.md")
  })
  it.each([
    "../../secret",
    "/tmp/file",
    "https://host/file",
    "C:\\file",
    "main.dashboard",
  ])("rejects unsafe or self reference %s", (value) => {
    expect(() => resourcePath("main.dashboard", value)).toThrow()
  })
  it("rejects unbounded geometry and forged sources", () => {
    const rect = {
      x: -10,
      y: 20,
      width: 400,
      height: 300,
      clipTop: 0,
      clipLeft: 10,
      clipRight: 0,
      clipBottom: 0,
    }
    expect(resourceRect(rect)).toEqual(rect)
    expect(
      resourceRect({
        ...rect,
        occlusions: [{ x: -5, y: 0, width: 168, height: 110 }],
      }).occlusions
    ).toHaveLength(1)
    expect(() =>
      resourceRect({
        ...rect,
        occlusions: [{ x: 0, y: 0, width: Infinity, height: 2 }],
      })
    ).toThrow()
    expect(() => resourceRect({ ...rect, occlusions: [rect, rect] })).toThrow()
    expect(resourceRect({ ...rect, interactive: false }).interactive).toBe(
      false
    )
    expect(() => resourceRect({ ...rect, interactive: "false" })).toThrow()
    expect(() => resourceRect({ ...rect, unknown: true })).toThrow()
    expect(() => resourceRect({ ...rect, width: Infinity })).toThrow()
    expect(() =>
      resourceSource({ kind: "file", path: "x", sessionId: "forged" })
    ).toThrow()
    expect(() =>
      resourceSource({ kind: "eidos-view", path: "x.eidos", tableId: "t" })
    ).toThrow()
  })
})
