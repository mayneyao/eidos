import { describe, expect, it } from "vitest"

import { smallestDependencyCycle } from "./dependency-graph"

describe("Eidos Runtime dependency cycle diagnostics", () => {
  it("returns the globally smallest normalized directed cycle", () => {
    const graph = new Map<string, Set<string>>([
      ["a", new Set(["c", "b"])],
      ["b", new Set(["a"])],
      ["c", new Set(["d"])],
      ["d", new Set(["a", "c"])],
    ])
    expect(smallestDependencyCycle(graph)).toEqual(["a", "b", "a"])
  })

  it("uses Field-ID order rather than insertion order", () => {
    const graph = new Map<string, Set<string>>([
      ["z", new Set(["z"])],
      ["b", new Set(["c"])],
      ["a", new Set(["d"])],
      ["d", new Set(["a"])],
      ["c", new Set(["b"])],
    ])
    expect(smallestDependencyCycle(graph)).toEqual(["a", "d", "a"])
  })
})
