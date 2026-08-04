import type { SpaceTreeEntry } from "../shared/contracts"
import {
  loadRecentFiles,
  parseRecentFiles,
  recentFilesStorageKey,
  rememberRecentFile,
  remapRecentFiles,
  storeRecentFiles,
} from "./recent-files"

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem(key: string) {
      return values.get(key) ?? null
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
  }
}

describe("Eidos Lite recent files", () => {
  it("keeps the most recently opened file first without duplicates", () => {
    const markdown: SpaceTreeEntry = {
      name: "notes.md",
      relativePath: "docs/notes.md",
      kind: "file",
      size: 12,
      modifiedAtMs: 1,
    }
    const database: SpaceTreeEntry = {
      name: "project.eidos",
      relativePath: "project.eidos",
      kind: "eidos",
      size: 24,
      modifiedAtMs: 2,
    }

    const files = rememberRecentFile(
      rememberRecentFile(rememberRecentFile([], markdown), database),
      markdown
    )

    expect(files.map((file) => file.relativePath)).toEqual([
      "docs/notes.md",
      "project.eidos",
    ])
  })

  it("persists recent files per Space and tolerates invalid storage", () => {
    const storage = memoryStorage()
    const files = [
      { relativePath: "notes.md", name: "notes.md", kind: "file" as const },
    ]

    storeRecentFiles(storage, "space/a", files)
    expect(loadRecentFiles(storage, "space/a")).toEqual(files)
    expect(recentFilesStorageKey("space/a")).not.toBe(
      recentFilesStorageKey("space/b")
    )
    expect(parseRecentFiles("not-json")).toEqual([])
  })

  it("updates nested paths after moves and removes deleted entries", () => {
    const files = [
      {
        relativePath: "docs/notes/today.md",
        name: "today.md",
        kind: "file" as const,
      },
      {
        relativePath: "project.eidos",
        name: "project.eidos",
        kind: "eidos" as const,
      },
    ]

    expect(remapRecentFiles(files, "docs", "archive")).toEqual([
      {
        relativePath: "archive/notes/today.md",
        name: "today.md",
        kind: "file",
      },
      files[1],
    ])
    expect(remapRecentFiles(files, "docs", null)).toEqual([files[1]])
  })
})
