import type { SpaceTreeEntry } from "../shared/contracts"
import {
  groupExplorerFiles,
  explorerGroupDateLabel,
  explorerRecentCutoff,
  readExplorerLayout,
} from "./explorer-layout"
import { filterExplorerEntries } from "./explorer-file-filter"
const now = new Date(2026, 10, 8, 0, 5)
const file = (path: string, days: number): SpaceTreeEntry => ({
  name: path.split("/").at(-1)!,
  relativePath: path,
  kind: path.endsWith(".eidos") ? "eidos" : "file",
  size: 1,
  modifiedAtMs: new Date(2026, 10, 8 - days, 0, 0).getTime(),
})
it("groups the last seven local calendar days and combines all older files into Earlier", () => {
  const entries = [
    file("today.md", 0),
    file("yesterday.md", 1),
    file("friday.md", 2),
    file("six.eidos", 6),
    file("seven.md", 7),
    file("old.md", 80),
  ]
  const groups = groupExplorerFiles(
    entries,
    { by: "modified", direction: "descending" },
    now
  )
  expect(groups.map((group) => group.id)).toEqual([
    "today",
    "yesterday",
    "date:" + Date.UTC(2026, 10, 6) / 86400000,
    "date:" + Date.UTC(2026, 10, 2) / 86400000,
    "earlier",
  ])
  expect(groups.at(-1)!.files.map((entry) => entry.name)).toEqual([
    "seven.md",
    "old.md",
  ])
  expect(explorerGroupDateLabel(groups[2]!, now, "en")).toBe("Friday")
  expect(explorerRecentCutoff(now)).toBe(new Date(2026, 10, 2).getTime())
  expect(groups.flatMap((group) => group.files)).toHaveLength(entries.length)
  expect(
    groupExplorerFiles([], { by: "name", direction: "ascending" }, now)
  ).toEqual([])
})
it("applies shared filtering and ordering without empty date headers or mutating files", () => {
  const children = [
    file("notes/z.md", 0),
    file("notes/a.md", 0),
    file("notes/data.eidos", 0),
  ]
  const entries: SpaceTreeEntry[] = [
    {
      name: "notes",
      relativePath: "notes",
      kind: "directory",
      size: 0,
      modifiedAtMs: 1,
      children,
    },
  ]
  const filtered = filterExplorerEntries(entries, [".md"])
  expect(
    groupExplorerFiles(
      filtered,
      { by: "name", direction: "ascending" },
      now
    )[0]!.files.map((entry) => entry.relativePath)
  ).toEqual(["notes/a.md", "notes/z.md"])
  expect(
    groupExplorerFiles(
      filtered,
      { by: "name", direction: "descending" },
      now
    )[0]!.files.map((entry) => entry.relativePath)
  ).toEqual(["notes/z.md", "notes/a.md"])
  expect(children[0]!.name).toBe("z.md")
  expect(
    groupExplorerFiles(
      [file("yesterday.md", 1)],
      { by: "name", direction: "ascending" },
      new Date(2026, 10, 7, 23, 59)
    )[0]!.label
  ).toBe("Today")
})
it("loads a safe layout default when storage is unavailable", () => {
  expect(readExplorerLayout({ getItem: () => "modified" })).toBe("modified")
  expect(readExplorerLayout({ getItem: () => "bad" })).toBe("tree")
  expect(
    readExplorerLayout({
      getItem: () => {
        throw Error("blocked")
      },
    })
  ).toBe("tree")
})
