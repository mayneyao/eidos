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
