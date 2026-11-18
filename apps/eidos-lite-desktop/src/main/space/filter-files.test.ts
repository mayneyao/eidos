import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expect, it } from "vitest"
import { filterSpaceFiles } from "./filter-files"
import { flattenSpaceTree, listSpaceDirectory } from "./space-paths"
import type {
  EidosFileFilterOperator,
  EidosFileFilterRule,
} from "@eidos.space/eidos-file"
import type { ExplorerCalendarExecution } from "../../shared/explorer-calendar"
import type { SpaceTreeEntry } from "../../shared/contracts"
import {
  countExplorerFilterRules,
  filterExplorerEntries,
  normalizeExplorerFileFilter,
  type ExplorerFilterGroup,
  type ExplorerFileSystemFilterRule,
} from "../../shared/explorer-file-filter"
import { compileExplorerFileSystemFilter } from "./explorer-file-system-predicates"

const execution: ExplorerCalendarExecution = {
  calendarQueryVersion: 2,
  calendarWindowVersion: 1,
  calendar: {
    timeZone: "America/New_York",
    timeZoneData: "2026f",
    weekStartsOn: 1,
  },
  referenceInstant: "2026-03-08T12:00:00.000Z",
}

function system(
  field: string,
  operator: EidosFileFilterOperator,
  value: EidosFileFilterRule["value"]
): ExplorerFileSystemFilterRule {
  return {
    type: "rule",
    id: `${field}-${operator}`,
    field: "file-system",
    operator: "matches",
    value: { type: "rule", field: `explorer:${field}`, operator, value },
  }
}

function group(
  ...children: ExplorerFilterGroup["children"]
): ExplorerFilterGroup {
  return { type: "group", id: "root", conjunction: "and", children }
}

it("finds matches in unexpanded folders and removes unrelated and genuinely empty folders", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-type-filter-"))
  try {
    for (const directory of [
      "empty",
      "unrelated",
      "notes/deep",
      ".eidos",
      ".graft",
    ])
      await fs.mkdir(path.join(root, directory), { recursive: true })
    for (const file of [
      "unrelated/photo.png",
      "notes/deep/note.MD",
      ".eidos/private.md",
      ".graft/private.md",
    ])
      await fs.writeFile(path.join(root, file), "fixture")
    const filtered = await filterSpaceFiles(root, [".md"], null)
    expect(
      flattenSpaceTree(filtered).map((entry) => entry.relativePath)
    ).toEqual(["notes", "notes/deep", "notes/deep/note.MD"])
    expect(filtered[0]!.childrenLoaded).toBe(true)
    const scoped = await filterSpaceFiles(root, [".md"], "notes")
    const byNameAndPath = await filterSpaceFiles(
      root,
      {
        type: "group",
        id: "root",
        conjunction: "and",
        children: [
          {
            type: "rule",
            id: "name",
            field: "name",
            operator: "contains",
            value: "NOTE",
          },
          {
            type: "rule",
            id: "path",
            field: "path",
            operator: "starts-with",
            value: "notes/deep/",
          },
        ],
      },
      "notes"
    )
    expect(
      flattenSpaceTree(byNameAndPath).map((entry) => entry.relativePath)
    ).toEqual(["notes/deep", "notes/deep/note.MD"])
    expect(flattenSpaceTree(scoped).map((entry) => entry.relativePath)).toEqual(
      ["notes/deep", "notes/deep/note.MD"]
    )
    expect(await filterSpaceFiles(root, [".eidos"], null)).toEqual([])
    expect(
      flattenSpaceTree(await filterSpaceFiles(root, [".md", ".png"], null)).map(
        (entry) => entry.relativePath
      )
    ).toEqual([
      "notes",
      "notes/deep",
      "notes/deep/note.MD",
      "unrelated",
      "unrelated/photo.png",
    ])
    await expect(
      filterSpaceFiles(root, [".md"], "../outside")
    ).rejects.toThrow()
    await fs.symlink(path.join(root, "notes"), path.join(root, "linked"))
    expect(
      flattenSpaceTree(await filterSpaceFiles(root, [".md"], null)).map(
        (entry) => entry.relativePath
      )
    ).not.toContain("linked/deep/note.MD")
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

it("uses creation, modification and size from the existing filesystem scan", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-file-stat-filter-")
  )
  try {
    await fs.mkdir(path.join(root, "notes/deep"), { recursive: true })
    for (const [relativePath, length, modified] of [
      ["notes/deep/right.txt", 2000, "2026-03-09T03:59:59.000Z"],
      ["notes/deep/too-late.txt", 2000, "2026-03-09T04:00:00.000Z"],
      ["notes/deep/too-small.txt", 999, "2026-03-08T05:00:00.000Z"],
      ["notes/deep/other.md", 3000, "2026-03-07T05:00:00.000Z"],
    ] as const) {
      const absolute = path.join(root, relativePath)
      await fs.writeFile(absolute, Buffer.alloc(length))
      const stats = await fs.lstat(absolute)
      await fs.utimes(absolute, stats.atime, new Date(modified))
    }
    const relativeWindow = system("modifiedAt", "is-in-calendar-window", {
      direction: "past",
      count: 1,
      unit: "day",
    })
    const filter = group(
      system("size", "is-between", [1000, 2000]),
      system("modifiedAt", "equals", "2026-03-08"),
      relativeWindow
    )
    const tree = await filterSpaceFiles(root, filter, null, execution)
    expect(flattenSpaceTree(tree).map((entry) => entry.relativePath)).toEqual([
      "notes",
      "notes/deep",
      "notes/deep/right.txt",
    ])
    const [parent] = await listSpaceDirectory(root, "notes")
    const parentStats = await fs.lstat(path.join(root, "notes/deep"))
    if (parentStats.birthtimeMs) {
      expect(parent!.createdAtMs).toBe(parentStats.birthtimeMs)
    }
    const stats = await fs.lstat(path.join(root, "notes/deep/right.txt"))
    if (stats.birthtimeMs) {
      const creation = new Date(stats.birthtimeMs).toISOString().slice(0, 10)
      const createdTree = await filterSpaceFiles(
        root,
        group(system("createdAt", "equals", creation)),
        null,
        { ...execution, calendar: { ...execution.calendar, timeZone: "UTC" } }
      )
      expect(flattenSpaceTree(createdTree)).toContainEqual(
        expect.objectContaining({
          relativePath: "notes/deep/right.txt",
          createdAtMs: stats.birthtimeMs,
          size: 2000,
        })
      )
    }
    expect(await fs.readdir(root)).toEqual(["notes"])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

it("composes builtin filters with extended fields and omits incomplete or reversed ranges", () => {
  const rules = group(
    system("modifiedAt", "is-between", ["2026-03-08", ""]),
    system("size", "is-between", [2000, 1000]),
    {
      type: "group",
      id: "properties",
      conjunction: "or",
      children: [
        system("createdAt", "less-than-or-equal", "2026-03-08"),
        {
          type: "rule",
          id: "tag",
          field: "property",
          operator: "matches",
          value: {
            type: "rule",
            field: "tag",
            operator: "equals",
            value: "review",
          },
        },
      ],
    }
  )
  const filter = normalizeExplorerFileFilter(rules)
  expect(countExplorerFilterRules(filter)).toBe(2)
  const entries: SpaceTreeEntry[] = ["early", "tagged", "missing", "late"].map(
    (name) => ({
      kind: "file",
      name,
      relativePath: name,
      size: 2000,
      modifiedAtMs: Date.parse("2026-03-09T04:00:00.000Z"),
      ...(name === "early"
        ? { createdAtMs: Date.parse("2026-03-09T03:59:59.999Z") }
        : name === "late"
          ? { createdAtMs: Date.parse("2026-03-09T04:00:00.000Z") }
          : {}),
    })
  )
  const { predicates } = compileExplorerFileSystemFilter(filter, execution)
  const matched = filterExplorerEntries(
    entries,
    filter,
    new Map([["tag", new Set(["tagged"])]]),
    predicates
  )
  expect(matched.map(({ name }) => name)).toEqual(["early", "tagged"])
})
