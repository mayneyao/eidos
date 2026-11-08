import { expect, it } from "vitest"
import {
  normalizeExplorerFilesQuery,
  selectExplorerFilesPage,
  type ExplorerFilesQuery,
} from "./explorer-file-list"
import { filterExplorerEntries } from "./explorer-file-filter"
import type { SpaceTreeEntry } from "./contracts"
const query: ExplorerFilesQuery = {
  directory: null,
  filter: [],
  sort: { by: "name", direction: "ascending" },
  sinceMs: new Date(2026, 10, 2).getTime(),
  period: "recent",
  offset: 0,
}
const files: SpaceTreeEntry[] = Array.from({ length: 125 }, (_, index) => ({
  name: String(index).padStart(3, "0") + ".md",
  relativePath: "notes/" + String(index).padStart(3, "0") + ".md",
  kind: "file",
  size: 1,
  modifiedAtMs: index < 5 ? query.sinceMs : query.sinceMs - 1,
}))
it("sends only the week on the initial request and pages Earlier in batches of 50", () => {
  const tree: SpaceTreeEntry[] = [
    {
      name: "notes",
      relativePath: "notes",
      kind: "directory",
      size: 0,
      modifiedAtMs: 0,
      children: files,
    },
  ]
  const recent = selectExplorerFilesPage(tree, query)
  expect(recent.entries).toHaveLength(5)
  expect(recent.earlierCount).toBe(120)
  const first = selectExplorerFilesPage(tree, { ...query, period: "earlier" })
  const second = selectExplorerFilesPage(tree, {
    ...query,
    period: "earlier",
    offset: 50,
  })
  const third = selectExplorerFilesPage(tree, {
    ...query,
    period: "earlier",
    offset: 100,
  })
  expect(first.entries).toHaveLength(50)
  expect(second.entries).toHaveLength(50)
  expect(third.entries).toHaveLength(20)
  expect(first.hasMore).toBe(true)
  expect(third.hasMore).toBe(false)
  expect(
    new Set(
      [...first.entries, ...second.entries, ...third.entries].map(
        (file) => file.relativePath
      )
    ).size
  ).toBe(120)
  expect(
    selectExplorerFilesPage(tree, {
      ...query,
      period: "earlier",
      sort: { by: "name", direction: "descending" },
    }).entries[0]!.name
  ).toBe("124.md")
  expect(
    selectExplorerFilesPage(filterExplorerEntries(tree, [".png"]), query)
      .earlierCount
  ).toBe(0)
})
it("rejects invalid periods, offsets, order and time values at the IPC boundary", () => {
  expect(normalizeExplorerFilesQuery(query)).toEqual(query)
  for (const patch of [
    { period: "all" },
    { offset: -1 },
    { offset: NaN },
    { sinceMs: Infinity },
    { sort: { by: "evil", direction: "ascending" } },
    { directory: 42 },
  ])
    expect(() => normalizeExplorerFilesQuery({ ...query, ...patch })).toThrow(
      "Invalid Explorer query"
    )
})
