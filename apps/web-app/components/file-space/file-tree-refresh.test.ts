// @vitest-environment node

import type { SpaceFileEntry } from "@eidos.space/file-space"

import { refreshExpandedDirectoryTree } from "./file-tree-refresh"

function directory(path: string): SpaceFileEntry {
  const parts = path.split("/")
  const name = parts.pop() ?? path
  return {
    name,
    path,
    parentPath: parts.join("/"),
    kind: "directory",
    size: 0,
    mtimeMs: 0,
  }
}

describe("expanded file tree refresh", () => {
  it("reloads only expanded directories that remain reachable", async () => {
    const tree = new Map<string, SpaceFileEntry[]>([
      ["", [directory("Notes"), directory("Archive")]],
      ["Notes", [directory("Notes/Nested")]],
      ["Notes/Nested", []],
    ])
    const loadDirectory = vi.fn(async (path: string) => tree.get(path) ?? [])

    await refreshExpandedDirectoryTree(
      "",
      new Set(["Notes", "Notes/Nested", "Removed", "Archive/Old"]),
      loadDirectory
    )

    expect(loadDirectory.mock.calls.map(([path]) => path)).toEqual([
      "",
      "Notes",
      "Notes/Nested",
    ])
  })

  it("refreshes an expanded subtree from its rescan root", async () => {
    const loadDirectory = vi
      .fn<(path: string) => Promise<SpaceFileEntry[]>>()
      .mockResolvedValueOnce([directory("Notes/Nested")])
      .mockResolvedValueOnce([])

    await refreshExpandedDirectoryTree(
      "Notes",
      new Set(["Notes", "Notes/Nested"]),
      loadDirectory
    )

    expect(loadDirectory.mock.calls.map(([path]) => path)).toEqual([
      "Notes",
      "Notes/Nested",
    ])
  })
})
