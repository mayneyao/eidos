import { describe, expect, it } from "vitest"
import { FileTree as PierreFileTree } from "@pierre/trees"

import type { SpaceTreeEntry } from "../shared/contracts"
import {
  SPACE_FILE_TREE_STYLES,
  buildSpaceFileTreeModel,
  canMoveTreeDrop,
  dropTargetDirectory,
  parentTreePaths,
  preservedExpandedTreePaths,
  relativePathFromTreePath,
  remappedTreePaths,
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

describe("preservedExpandedTreePaths", () => {
  it("keeps a deep directory open when lazy-loaded children reset the paths", () => {
    const model = new PierreFileTree({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ["projects/"],
      initialExpansion: "closed",
      paths: ["projects/", "projects/archive/"],
    })

    const archive = model.getItem("projects/archive/")
    expect(archive !== null && "expand" in archive).toBe(true)
    if (archive && "expand" in archive) archive.expand()
    const nextPaths = [
      "projects/",
      "projects/archive/",
      "projects/archive/history.eidos",
    ]
    model.resetPaths(nextPaths, {
      initialExpandedPaths: preservedExpandedTreePaths(nextPaths, model),
    })

    const restoredArchive = model.getItem("projects/archive/")
    expect(
      restoredArchive && "isExpanded" in restoredArchive
        ? restoredArchive.isExpanded()
        : false
    ).toBe(true)
    model.cleanUp()
  })
})

describe("remappedTreePaths", () => {
  const paths = [
    "projects/",
    "projects/archive/",
    "projects/archive/history.eidos",
    "projects/roadmap.eidos",
    "README.md",
  ]

  it("rewrites a file rename without touching sibling prefixes", () => {
    expect(remappedTreePaths(paths, "README.md", "README.md.backup")).toEqual([
      ...paths.slice(0, -1),
      "README.md.backup",
    ])
    expect(
      remappedTreePaths(["notes.md", "notes.md.bak"], "notes.md", "journal.md")
    ).toEqual(["journal.md", "notes.md.bak"])
  })

  it("rewrites a folder rename including every descendant", () => {
    expect(
      remappedTreePaths(paths, "projects/archive/", "projects/attic/")
    ).toEqual([
      "projects/",
      "projects/attic/",
      "projects/attic/history.eidos",
      "projects/roadmap.eidos",
      "README.md",
    ])
  })

  it("rewrites a drag move into a target directory", () => {
    expect(remappedTreePaths(paths, "README.md", "projects/README.md")).toEqual(
      [...paths.slice(0, -1), "projects/README.md"]
    )
    expect(remappedTreePaths(paths, "projects/", "archive/projects/")).toEqual([
      "archive/projects/",
      "archive/projects/archive/",
      "archive/projects/archive/history.eidos",
      "archive/projects/roadmap.eidos",
      "README.md",
    ])
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
