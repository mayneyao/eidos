import { describe, expect, it } from "vitest"

import type { SpaceTreeEntry } from "../shared/contracts"
import { buildSpaceFileTreeModel, parentTreePaths } from "./space-file-tree"

describe("buildSpaceFileTreeModel", () => {
  it("uses canonical Space paths and expands only root directories", () => {
    const entries: SpaceTreeEntry[] = [
      {
        name: "projects",
        relativePath: "projects",
        kind: "directory",
        size: 0,
        modifiedAtMs: 1,
        children: [
          {
            name: "archive",
            relativePath: "projects/archive",
            kind: "directory",
            size: 0,
            modifiedAtMs: 1,
            children: [
              {
                name: "history.eidos",
                relativePath: "projects/archive/history.eidos",
                kind: "eidos",
                size: 10,
                modifiedAtMs: 1,
              },
            ],
          },
        ],
      },
      {
        name: "README.md",
        relativePath: "README.md",
        kind: "file",
        size: 20,
        modifiedAtMs: 1,
      },
    ]

    const model = buildSpaceFileTreeModel(entries)

    expect(model.paths).toEqual([
      "projects/",
      "projects/archive/",
      "projects/archive/history.eidos",
      "README.md",
    ])
    expect(model.initialExpandedPaths).toEqual(["projects/"])
    expect(
      model.entryByTreePath.get("projects/archive/history.eidos")?.kind
    ).toBe("eidos")
  })

  it("derives every folder needed for programmatic selection", () => {
    expect(parentTreePaths("projects/active/Roadmap.eidos")).toEqual([
      "projects/",
      "projects/active/",
    ])
    expect(parentTreePaths("Roadmap.eidos")).toEqual([])
  })
})
