import { expect, it } from "vitest"
import type { SpaceTreeEntry } from "../shared/contracts"
import { filterExplorerNames } from "./explorer-name-filter"

const file = (path: string): SpaceTreeEntry => ({
  name: path.split("/").at(-1)!,
  relativePath: path,
  kind: "file",
  size: 0,
  modifiedAtMs: 0,
})
const tree: SpaceTreeEntry[] = [
  {
    ...file("notes"),
    kind: "directory",
    childrenLoaded: true,
    children: [
      {
        ...file("notes/deep"),
        kind: "directory",
        childrenLoaded: true,
        children: [file("notes/deep/ReadMe.md"), file("notes/deep/other.md")],
      },
      file("notes/other.txt"),
    ],
  },
  { ...file("empty"), kind: "directory", childrenLoaded: true, children: [] },
]

it("matches basenames case-insensitively and retains only the required ancestors", () => {
  const matches = filterExplorerNames(tree, " readME ")
  expect(matches[0]?.relativePath).toBe("notes")
  expect(matches[0]?.children?.[0]?.relativePath).toBe("notes/deep")
  expect(matches[0]?.children?.[0]?.children?.map((item) => item.name)).toEqual(
    ["ReadMe.md"]
  )
  expect(filterExplorerNames(tree, "notes/")).toEqual([])
  expect(filterExplorerNames(tree, "rdm")).toEqual([])
  expect(filterExplorerNames(tree, "missing")).toEqual([])
  expect(filterExplorerNames(tree, "")).toBe(tree)
})

it("keeps matching folders, including empty folders, with their browsing context", () => {
  expect(filterExplorerNames(tree, "empty")).toEqual([tree[1]])
  expect(filterExplorerNames(tree, "deep")[0]?.children).toEqual([
    tree[0]?.children?.[0],
  ])
  expect(tree[0]?.children).toHaveLength(2)
})
