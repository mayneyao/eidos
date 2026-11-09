import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { SpaceSession } from "./space-session"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import * as filters from "./filter-files"
import type { ExplorerFilesQuery } from "../../shared/explorer-file-list"
afterEach(() => vi.restoreAllMocks())
it("keeps ignored scan caches and Earlier counts separate, and refreshes edited ignore rules", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "recent-ignore-session-")
  )
  const state = await fs.mkdtemp(path.join(os.tmpdir(), "recent-ignore-state-"))
  const graft = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
  let session: SpaceSession | undefined
  const sinceMs = new Date(2026, 10, 2).getTime()
  const query: ExplorerFilesQuery = {
    directory: null,
    filter: [".md"],
    sort: { by: "name", direction: "ascending" },
    sinceMs,
    period: "recent",
    offset: 0,
  }
  try {
    for (const folder of ["generated", "notes"]) {
      await fs.mkdir(path.join(root, "project", folder), { recursive: true })
      for (const [name, time] of [
        ["new", sinceMs],
        ["old", sinceMs - 1],
      ] as const) {
        const file = path.join(root, "project", folder, `${name}.md`)
        await fs.writeFile(file, "fixture")
        await fs.utimes(file, new Date(time), new Date(time))
      }
    }
    await fs.writeFile(path.join(root, "project/.gitignore"), "generated/\n")
    session = await SpaceSession.create(root, state, { graft })
    const scan = vi.spyOn(filters, "readSpaceFilterTree")
    expect(
      (await session.listExplorerFiles(query)).entries.map(
        (f) => f.relativePath
      )
    ).toEqual(["project/notes/new.md"])
    expect(
      (
        await session.listExplorerFiles({ ...query, period: "earlier" })
      ).entries.map((f) => f.relativePath)
    ).toEqual(["project/notes/old.md"])
    expect((await session.listExplorerFiles(query)).earlierCount).toBe(1)
    const all = await session.listExplorerFiles({
      ...query,
      respectGitignore: false,
    })
    expect(all.entries).toHaveLength(2)
    expect(all.earlierCount).toBe(2)
    expect((await session.listExplorerFiles(query)).entries).toHaveLength(1)
    expect(scan).toHaveBeenCalledTimes(2)
    const byName = {
      type: "group" as const,
      id: "name-filter",
      conjunction: "and" as const,
      children: [
        {
          type: "rule" as const,
          id: "name",
          field: "name" as const,
          operator: "contains" as const,
          value: "new",
        },
      ],
    }
    expect(
      (
        await session.listExplorerFiles({ ...query, filter: byName })
      ).entries.map((entry) => entry.relativePath)
    ).toEqual(["project/notes/new.md"])
    expect(
      (
        await session.listExplorerFiles({
          ...query,
          filter: byName,
          respectGitignore: false,
        })
      ).entries
    ).toHaveLength(2)
    expect(
      (await session.filterFiles(byName, null, true)).flatMap(
        (folder) =>
          folder.children?.flatMap((child) => child.children ?? []) ?? []
      )
    ).toHaveLength(1)
    const tree = await session.filterFiles([".md"], null, true)
    expect(
      tree.flatMap(
        (folder) =>
          folder.children?.flatMap((child) => child.children ?? []) ?? []
      )
    ).toHaveLength(2)
    expect(scan).toHaveBeenCalledTimes(2)
    expect(
      (await session.filterFiles([".md"], null)).flatMap(
        (folder) =>
          folder.children?.flatMap((child) => child.children ?? []) ?? []
      )
    ).toHaveLength(4)
    expect(await session.filterFiles([".ts"], null, true)).toEqual([])
    expect(
      (await session.filterFiles([".md"], null, false)).flatMap(
        (folder) =>
          folder.children?.flatMap((child) => child.children ?? []) ?? []
      )
    ).toHaveLength(4)
    expect(scan).toHaveBeenCalledTimes(2)
    await fs.writeFile(path.join(root, "project/.gitignore"), "")
    await session.refreshExplorer()
    expect((await session.listExplorerFiles(query)).entries).toHaveLength(2)
    expect(scan).toHaveBeenCalledTimes(3)
  } finally {
    await session?.close()
    await graft.close()
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(state, { recursive: true, force: true })
  }
})
it("caches the filesystem scan between pages and invalidates it on explicit Explorer refresh", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-recent-files-"))
  const state = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-recent-state-"))
  const graft = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
  let session: SpaceSession | undefined
  const sinceMs = new Date(2026, 10, 2).getTime()
  const query: ExplorerFilesQuery = {
    directory: null,
    filter: [],
    sort: { by: "name", direction: "ascending" },
    sinceMs,
    period: "recent",
    offset: 0,
  }
  try {
    await fs.mkdir(path.join(root, "notes"))
    await Promise.all(
      Array.from({ length: 58 }, async (_, index) => {
        const file = path.join(
          root,
          "notes",
          String(index).padStart(2, "0") + ".md"
        )
        await fs.writeFile(file, "fixture")
        const modified = index < 3 ? sinceMs : sinceMs - 1
        await fs.utimes(file, new Date(modified), new Date(modified))
      })
    )
    session = await SpaceSession.create(root, state, { graft })
    await session.searchPaths("notes")
    const scan = vi.spyOn(filters, "readSpaceFilterTree")
    const recent = await session.listExplorerFiles(query)
    expect(recent.entries).toHaveLength(3)
    expect(recent.earlierCount).toBe(55)
    expect(
      (await session.listExplorerFiles({ ...query, period: "earlier" })).entries
    ).toHaveLength(50)
    expect(
      (
        await session.listExplorerFiles({
          ...query,
          period: "earlier",
          offset: 50,
        })
      ).entries
    ).toHaveLength(5)
    expect(scan).toHaveBeenCalledTimes(1)
    await fs.writeFile(path.join(root, "fresh.md"), "fresh")
    await session.refreshExplorer()
    expect(
      (await session.listExplorerFiles(query)).entries.map(
        (file) => file.relativePath
      )
    ).toContain("fresh.md")
    expect(scan).toHaveBeenCalledTimes(2)
    await expect(
      session.listExplorerFiles({ ...query, directory: "../outside" })
    ).rejects.toThrow()
  } finally {
    await session?.close()
    await graft.close()
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(state, { recursive: true, force: true })
  }
})
