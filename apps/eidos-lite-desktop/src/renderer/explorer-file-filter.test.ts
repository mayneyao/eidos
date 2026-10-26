import { expect, it } from "vitest"
import {
  matchesExplorerFileFilter,
  parseExplorerFileFilter,
  normalizeExplorerFileFilter,
  countExplorerFilterRules,
  filterExplorerEntries,
  toExplorerFilterGroup,
  explorerFilterSignature,
  type ExplorerFilterGroup,
} from "./explorer-file-filter"
import { buildSpaceFileTreeModel } from "./space-file-tree"
import type { SpaceTreeEntry } from "../shared/contracts"

it("retains host-filtered property matches, including mixed OR conditions and folder scope", () => {
  const file: SpaceTreeEntry = {
    name: "note.md",
    relativePath: "docs/note.md",
    kind: "file",
    size: 1,
    modifiedAtMs: 1,
  }
  const entries: SpaceTreeEntry[] = [
    {
      name: "docs",
      relativePath: "docs",
      kind: "directory",
      size: 0,
      modifiedAtMs: 1,
      childrenLoaded: true,
      children: [file],
    },
  ]
  const property: ExplorerFilterGroup = {
    type: "group",
    id: "root",
    conjunction: "and",
    children: [
      {
        type: "rule",
        id: "status",
        field: "property",
        operator: "matches",
        value: {
          type: "rule",
          field: "status-id",
          operator: "equals",
          value: "Done",
        },
      },
    ],
  }
  expect(
    buildSpaceFileTreeModel(entries, null, undefined, property).paths
  ).toEqual(["docs/", "docs/note.md"])
  expect(
    buildSpaceFileTreeModel([file], "docs", undefined, property).paths
  ).toEqual(["note.md"])
  expect(
    buildSpaceFileTreeModel(entries, null, undefined, {
      ...property,
      conjunction: "or",
      children: [
        ...property.children,
        {
          type: "rule",
          id: "suffix",
          field: "suffix",
          operator: "in",
          value: [".png"],
        },
      ],
    }).paths
  ).toEqual(["docs/", "docs/note.md"])
  expect(buildSpaceFileTreeModel([], null, undefined, property).paths).toEqual(
    []
  )
})

it("accepts arbitrary multiple and compound suffixes, normalizes aliases, and matches their union", () => {
  const filter = parseExplorerFileFilter("*.MD, csv .tar.gz；.custom，.md")
  expect(filter).toEqual([".csv", ".custom", ".md", ".tar.gz"])
  for (const name of ["archive.TAR.GZ", "custom.custom", "note.md", "data.csv"])
    expect(matchesExplorerFileFilter(name, filter)).toBe(true)
  expect(matchesExplorerFileFilter("not-csv.txt", filter)).toBe(false)
  expect(parseExplorerFileFilter("  ")).toEqual([])
  expect(() => parseExplorerFileFilter("docs/*.md")).toThrow()
  expect(() => normalizeExplorerFileFilter(".md")).toThrow()
  expect(() => normalizeExplorerFileFilter([".md", 1])).toThrow()
  expect(() => normalizeExplorerFileFilter(Array(33).fill(".md"))).toThrow()
})

it("combines literal names, suffix sets and paths using nested AND/OR while ignoring empty drafts", () => {
  const filter: ExplorerFilterGroup = {
    type: "group",
    id: "root",
    conjunction: "and",
    children: [
      {
        type: "rule",
        id: "name",
        field: "name",
        operator: "contains",
        value: "Report",
      },
      {
        type: "rule",
        id: "empty",
        field: "name",
        operator: "not-contains",
        value: "",
      },
      {
        type: "group",
        id: "types",
        conjunction: "or",
        children: [
          {
            type: "rule",
            id: "suffix",
            field: "suffix",
            operator: "in",
            value: [".md", ".tar.gz"],
          },
          {
            type: "rule",
            id: "path",
            field: "path",
            operator: "starts-with",
            value: "exports/",
          },
        ],
      },
    ],
  }
  expect(countExplorerFilterRules(filter)).toBe(3)
  expect(explorerFilterSignature(filter)).toBe(
    explorerFilterSignature({
      ...filter,
      id: "different",
      children: filter.children.filter((child) => child.id !== "empty"),
    })
  )
  expect(matchesExplorerFileFilter("REPORT.MD", filter, "docs/REPORT.MD")).toBe(
    true
  )
  expect(
    matchesExplorerFileFilter("report.csv", filter, "exports/report.csv")
  ).toBe(true)
  expect(
    matchesExplorerFileFilter("report.csv", filter, "docs/report.csv")
  ).toBe(false)
  expect(matchesExplorerFileFilter("note.md", filter, "reports/note.md")).toBe(
    false
  )
  expect(matchesExplorerFileFilter("report.TAR.GZ", filter)).toBe(true)
  const empty: ExplorerFilterGroup = {
    type: "group",
    id: "empty",
    conjunction: "or",
    children: [
      {
        type: "rule",
        id: "blank",
        field: "name",
        operator: "contains",
        value: "",
      },
    ],
  }
  expect(matchesExplorerFileFilter("anything", empty)).toBe(true)
  expect(countExplorerFilterRules(empty)).toBe(0)
  const entries: SpaceTreeEntry[] = [
    {
      name: "README.md",
      relativePath: "docs/README.md",
      kind: "file",
      size: 0,
      modifiedAtMs: 0,
    },
  ]
  expect(filterExplorerEntries(entries, empty)).toBe(entries)
  const migrated = toExplorerFilterGroup([".md", ".csv"])
  expect(migrated.children[0]).toMatchObject({
    field: "suffix",
    operator: "in",
    value: [".md", ".csv"],
  })
})

it("handles negative rules, exact literals and text boundaries without wildcard interpretation", () => {
  const group = (
    operator: "equals" | "starts-with" | "ends-with" | "not-contains",
    value: string
  ): ExplorerFilterGroup => ({
    type: "group",
    id: "root",
    conjunction: "and",
    children: [{ type: "rule", id: "rule", field: "name", operator, value }],
  })
  expect(matchesExplorerFileFilter("a[1].MD", group("equals", "A[1].md"))).toBe(
    true
  )
  expect(matchesExplorerFileFilter("a1.md", group("equals", "a*.md"))).toBe(
    false
  )
  expect(
    matchesExplorerFileFilter("report.md", group("starts-with", "rep"))
  ).toBe(true)
  expect(
    matchesExplorerFileFilter("report.md", group("ends-with", ".MD"))
  ).toBe(true)
  expect(
    matchesExplorerFileFilter("draft.md", group("not-contains", "draft"))
  ).toBe(false)
  const negative: ExplorerFilterGroup = {
    type: "group",
    id: "root",
    conjunction: "and",
    children: [
      {
        type: "rule",
        id: "rule",
        field: "suffix",
        operator: "not-in",
        value: [".md", ".tar.gz"],
      },
    ],
  }
  expect(matchesExplorerFileFilter("archive.tar.gz", negative)).toBe(false)
  expect(matchesExplorerFileFilter("README", negative)).toBe(true)
})

it("validates untrusted structured filters and bounds their size and depth", () => {
  const valid: ExplorerFilterGroup = {
    type: "group",
    id: "root",
    conjunction: "and",
    children: [
      {
        type: "rule",
        id: "rule",
        field: "suffix",
        operator: "in",
        value: ["*.MD", "md"],
      },
    ],
  }
  expect(normalizeExplorerFileFilter(valid)).toMatchObject({
    children: [{ value: [".md"] }],
  })
  for (const invalid of [
    null,
    {},
    { ...valid, conjunction: "xor" },
    {
      ...valid,
      children: [
        {
          type: "rule",
          id: "rule",
          field: "path",
          operator: "regex",
          value: ".*",
        },
      ],
    },
    {
      ...valid,
      children: [
        {
          type: "rule",
          id: "rule",
          field: "name",
          operator: "contains",
          value: 1,
        },
      ],
    },
    { ...valid, children: Array(65).fill(valid.children[0]) },
  ])
    expect(() => normalizeExplorerFileFilter(invalid)).toThrow()
  let deep = valid
  for (let i = 0; i < 4; i++) deep = { ...valid, children: [deep] }
  expect(() => normalizeExplorerFileFilter(deep)).toThrow()
})

it("matches file extensions without treating directory names as extensions", () => {
  expect(
    matchesExplorerFileFilter("notes/HELLO.MARKDOWN", [".md", ".markdown"])
  ).toBe(true)
  expect(matchesExplorerFileFilter("data.EIDOS", [".eidos"])).toBe(true)
  expect(matchesExplorerFileFilter("photo.HEIC", [".png", ".heic"])).toBe(true)
  expect(matchesExplorerFileFilter("paper.PDF", [".pdf"])).toBe(true)
  expect(matchesExplorerFileFilter("song.flac", [".flac"])).toBe(true)
  expect(matchesExplorerFileFilter("film.webm", [".webm"])).toBe(true)
  expect(
    matchesExplorerFileFilter("photo.png/note.txt", [".png", ".heic"])
  ).toBe(false)
  expect(matchesExplorerFileFilter("README", [".md", ".markdown"])).toBe(false)
  expect(matchesExplorerFileFilter("arbitrary", [])).toBe(true)
})

it("keeps only matching ancestors and restores folders when clearing the filter", () => {
  const file = (name: string, parent = ""): SpaceTreeEntry => ({
    name,
    relativePath: parent ? `${parent}/${name}` : name,
    kind: "file",
    size: 0,
    modifiedAtMs: 0,
  })
  const lazy: SpaceTreeEntry = {
    ...file("pending"),
    kind: "directory",
    childrenLoaded: false,
  }
  const entries: SpaceTreeEntry[] = [
    file("data.eidos"),
    {
      ...file("docs"),
      kind: "directory",
      childrenLoaded: true,
      children: [file("note.md", "docs"), file("image.png", "docs")],
    },
    lazy,
  ]
  expect(
    buildSpaceFileTreeModel(entries, null, undefined, [".md", ".markdown"])
      .paths
  ).toEqual(["docs/", "docs/note.md"])
  const hydrated = [
    ...entries.slice(0, -1),
    {
      ...lazy,
      childrenLoaded: true,
      children: [file("later.MD", "pending"), file("other.png", "pending")],
    },
  ]
  expect(
    buildSpaceFileTreeModel(hydrated, null, undefined, [".md", ".markdown"])
      .paths
  ).toContain("pending/later.MD")
  expect(
    buildSpaceFileTreeModel(hydrated, null, undefined, [".md", ".markdown"])
      .paths
  ).not.toContain("pending/other.png")
  expect(buildSpaceFileTreeModel(entries, null, undefined, []).paths).toEqual([
    "docs/",
    "docs/image.png",
    "docs/note.md",
    "pending/",
    "data.eidos",
  ])
  expect(entries[1]!.children).toHaveLength(2)
})
