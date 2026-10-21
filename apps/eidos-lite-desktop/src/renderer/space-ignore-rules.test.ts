import type { SpaceTreeEntry } from "../shared/contracts"
import {
  appendVideoIgnorePatterns,
  videoFileSummary,
  VIDEO_IGNORE_PATTERNS,
} from "./space-ignore-rules"

function entry(
  name: string,
  kind: SpaceTreeEntry["kind"],
  size = 0,
  children?: SpaceTreeEntry[]
): SpaceTreeEntry {
  return {
    name,
    relativePath: name,
    kind,
    size,
    modifiedAtMs: 1,
    children,
  }
}

it("appends missing video patterns once and keeps existing rules", () => {
  const first = appendVideoIgnorePatterns("*.tmp\n*.mp4\n")
  expect(first.added).toEqual(
    VIDEO_IGNORE_PATTERNS.filter((pattern) => pattern !== "*.mp4")
  )
  expect(first.content).toContain("*.tmp")
  expect(first.content).toContain("# Video files")
  expect(first.content.split("*.mp4")).toHaveLength(2)
  const second = appendVideoIgnorePatterns(first.content)
  expect(second.added).toEqual([])
  expect(second.content).toBe(first.content)
})

it("does not add a second video header when patterns are partial", () => {
  const result = appendVideoIgnorePatterns("# Video files\n*.mp4\n")
  expect(result.content.match(/# Video files/g)).toHaveLength(1)
  expect(result.content).toContain("*.mov")
})

it("summarizes nested video entries without counting folders", () => {
  expect(
    videoFileSummary([
      entry("media", "directory", 0, [
        entry("clip.MP4", "file", 1200),
        entry("notes.md", "file", 20),
        entry("nested", "directory", 0, [entry("clip.webm", "file", 800)]),
      ]),
      entry("archive.mov", "file", 400),
    ])
  ).toEqual({ count: 3, bytes: 2400 })
})
