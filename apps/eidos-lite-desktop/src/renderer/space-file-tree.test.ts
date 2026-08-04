import { describe, expect, it } from "vitest"

import type { SpaceTreeEntry } from "../shared/contracts"
import {
  SPACE_FILE_TREE_STYLES,
  buildSpaceFileTreeModel,
  canMoveTreeDrop,
  dropTargetDirectory,
  parentTreePaths,
  relativePathFromTreePath,
} from "./space-file-tree"

describe("Space file tree theme", () => {
  it("inherits the resolved app color scheme inside the Pierre shadow root", () => {
    expect(SPACE_FILE_TREE_STYLES.colorScheme).toBe("inherit")
  })
})

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

describe("Space file tree drag and drop", () => {
  it("maps Pierre tree paths to Space move destinations", () => {
    expect(relativePathFromTreePath("projects/archive/")).toBe(
      "projects/archive"
    )
    expect(
      dropTargetDirectory({
        directoryPath: "projects/archive/",
        flattenedSegmentPath: null,
        hoveredPath: "projects/archive/",
        kind: "directory",
      })
    ).toBe("projects/archive")
    expect(
      dropTargetDirectory({
        directoryPath: null,
        flattenedSegmentPath: null,
        hoveredPath: null,
        kind: "root",
      })
    ).toBeNull()
  })

  it("allows one-item moves while rejecting no-op and multi-item drops", () => {
    const target = {
      directoryPath: "archive/",
      flattenedSegmentPath: null,
      hoveredPath: "archive/",
      kind: "directory" as const,
    }

    expect(canMoveTreeDrop({ draggedPaths: ["notes/today.md"], target })).toBe(
      true
    )
    expect(
      canMoveTreeDrop({ draggedPaths: ["archive/today.md"], target })
    ).toBe(false)
    expect(
      canMoveTreeDrop({
        draggedPaths: ["notes/today.md", "notes/tomorrow.md"],
        target,
      })
    ).toBe(false)
  })
})
