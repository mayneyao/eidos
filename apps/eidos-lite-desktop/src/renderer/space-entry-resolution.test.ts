import { describe, expect, it, vi } from "vitest"

import type { SpaceSnapshot } from "../shared/contracts"
import { resolveSpaceEntry } from "./space-entry-resolution"

function snapshot(entries: SpaceSnapshot["entries"]): SpaceSnapshot {
  return {
    id: "space-1",
    name: "Space",
    displayPath: "/Space",
    entries,
    eidosFileCount: 1,
    operation: { phase: "ready", recoverable: false },
    graft: {
      available: true,
      backend: "sdk",
      expectedVersion: "0.3.8",
      initialized: false,
    },
    invalidatedSessionIds: [],
  }
}

describe("resolveSpaceEntry", () => {
  it("loads each unopened parent directory before resolving a launch path", async () => {
    const initial = snapshot([
      {
        name: "projects",
        relativePath: "projects",
        kind: "directory",
        size: 0,
        modifiedAtMs: 0,
        children: [],
        childrenLoaded: false,
      },
    ])
    const loaded = snapshot([
      {
        ...initial.entries[0]!,
        childrenLoaded: true,
        children: [
          {
            name: "content-calendar.eidos",
            relativePath: "projects/content-calendar.eidos",
            kind: "eidos",
            size: 1024,
            modifiedAtMs: 1,
          },
        ],
      },
    ])
    const loadDirectory = vi.fn(async () => loaded)

    const result = await resolveSpaceEntry(
      initial,
      "projects/content-calendar.eidos",
      loadDirectory
    )

    expect(loadDirectory).toHaveBeenCalledWith("projects")
    expect(result.snapshot).toBe(loaded)
    expect(result.entry?.relativePath).toBe("projects/content-calendar.eidos")
  })

  it("does not load a directory when the target is already materialized", async () => {
    const loaded = snapshot([
      {
        name: "file.eidos",
        relativePath: "file.eidos",
        kind: "eidos",
        size: 1024,
        modifiedAtMs: 1,
      },
    ])
    const loadDirectory =
      vi.fn<(relativePath: string) => Promise<SpaceSnapshot>>()

    const result = await resolveSpaceEntry(loaded, "file.eidos", loadDirectory)

    expect(loadDirectory).not.toHaveBeenCalled()
    expect(result.entry?.relativePath).toBe("file.eidos")
  })
})
