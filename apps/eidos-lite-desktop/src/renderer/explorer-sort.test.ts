import { FileTree, preloadFileTree } from "@pierre/trees"
import {
  compareExplorerEntries,
  readExplorerSort,
  DEFAULT_EXPLORER_SORT,
  type ExplorerSort,
} from "./explorer-sort"
import { buildSpaceFileTreeModel } from "./space-file-tree"
import type { SpaceTreeEntry } from "../shared/contracts"

function entry(
  name: string,
  kind: SpaceTreeEntry["kind"] = "file",
  modifiedAtMs = 0
): SpaceTreeEntry {
  return { name, relativePath: name, kind, modifiedAtMs, size: 0 }
}
const entries = [
  entry("file10.md", "file", 10),
  entry("data.eidos", "eidos", 20),
  entry("file2.md", "file", 30),
  entry("assets", "directory", 5),
  entry("README", "symlink", 15),
]
function sorted(sort: ExplorerSort) {
  return [...entries]
    .sort((a, b) => compareExplorerEntries(a, b, sort))
    .map((item) => item.name)
}

it("uses natural names and keeps folders first in both directions", () => {
  expect(sorted(DEFAULT_EXPLORER_SORT)).toEqual([
    "assets",
    "data.eidos",
    "file2.md",
    "file10.md",
    "README",
  ])
  expect(sorted({ by: "name", direction: "descending" })).toEqual([
    "assets",
    "README",
    "file10.md",
    "file2.md",
    "data.eidos",
  ])
})
it("sorts all file kinds together by modification time and extension", () => {
  expect(sorted({ by: "modified", direction: "descending" })).toEqual([
    "assets",
    "file2.md",
    "data.eidos",
    "README",
    "file10.md",
  ])
  expect(sorted({ by: "type", direction: "ascending" })).toEqual([
    "assets",
    "README",
    "data.eidos",
    "file2.md",
    "file10.md",
  ])
})
it("orders nested siblings without changing canonical paths or mutating entries", () => {
  const folder = entry("assets", "directory")
  folder.children = [entry("assets/z.txt"), entry("assets/a.txt")].map(
    (item) => ({ ...item, name: item.relativePath.split("/").at(-1)! })
  )
  expect(
    buildSpaceFileTreeModel([folder], "", DEFAULT_EXPLORER_SORT).paths
  ).toEqual(["assets/", "assets/a.txt", "assets/z.txt"])
  expect(folder.children[0]!.relativePath).toBe("assets/z.txt")
})
it("reorders Pierre on reset while retaining expansion and selection", () => {
  let sort = DEFAULT_EXPLORER_SORT
  const folder = entry("assets", "directory")
  folder.children = [entry("assets/a.txt"), entry("assets/z.txt")]
  const data = [folder, ...entries.filter((item) => item.name !== "assets")]
  const built = buildSpaceFileTreeModel(data)
  const model = new FileTree({
    paths: built.paths,
    sort: (a, b) =>
      compareExplorerEntries(
        built.entryByTreePath.get(a.path)!,
        built.entryByTreePath.get(b.path)!,
        sort
      ),
  })
  const directory = model.getItem("assets/")!
  if ("expand" in directory) directory.expand()
  model.getItem("file2.md")!.select()
  model.getItem("file2.md")!.focus()
  sort = { by: "modified", direction: "descending" }
  model.resetPaths(buildSpaceFileTreeModel(data, null, sort).paths, {
    initialExpandedPaths: ["assets/"],
  })
  expect(model.getSelectedPaths()).toEqual(["file2.md"])
  expect(model.getFocusedPath()).toBe("file2.md")
  const restored = model.getItem("assets/")!
  expect("isExpanded" in restored && restored.isExpanded()).toBe(true)
  const rendered = preloadFileTree({
    paths: built.paths,
    sort: (a, b) =>
      compareExplorerEntries(
        built.entryByTreePath.get(a.path)!,
        built.entryByTreePath.get(b.path)!,
        sort
      ),
    initialExpandedPaths: ["assets/"],
    initialVisibleRowCount: 20,
  })
  const positions = [
    "assets/",
    "assets/z.txt",
    "assets/a.txt",
    "file2.md",
    "data.eidos",
    "README",
    "file10.md",
  ].map((path) => rendered.shadowHtml.indexOf(`data-item-path="${path}"`))
  expect(positions.every((position) => position >= 0)).toBe(true)
  expect(positions).toEqual([...positions].sort((a, b) => a - b))
  model.cleanUp()
})
it("loads valid preferences and falls back safely for corrupt storage", () => {
  expect(
    readExplorerSort({
      getItem: () => '{"by":"modified","direction":"descending"}',
    })
  ).toEqual({ by: "modified", direction: "descending" })
  for (const value of ["bad", "null", '{"by":"size","direction":"ascending"}'])
    expect(readExplorerSort({ getItem: () => value })).toEqual(
      DEFAULT_EXPLORER_SORT
    )
})
