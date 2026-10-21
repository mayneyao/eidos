import type { SpaceTreeEntry } from "../shared/contracts"
import {
  appendIgnorePatterns,
  appendVideoIgnorePatterns,
  IGNORE_TEMPLATES,
  ignorePathPattern,
  spaceIgnorePreflight,
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

it("reports large files and symlinks in the preflight summary", () => {
  const summary = spaceIgnorePreflight(
    [
      entry("media", "directory", 0, [
        entry("clip.mp4", "file", 2000),
        entry("notes.md", "file", 20),
        entry("big.zip", "file", 1500),
        entry("link", "symlink", 10),
      ]),
    ],
    1000,
    1
  )
  expect(summary).toMatchObject({
    totalFiles: 4,
    totalBytes: 3530,
    videoCount: 1,
    videoBytes: 2000,
    symlinkCount: 1,
    largeFileCount: 2,
  })
  expect(summary.largeFiles).toEqual([{ path: "clip.mp4", size: 2000 }])
})

it("anchors and escapes exact paths, and applies templates once", () => {
  expect(ignorePathPattern("clips/a#1!.mp4")).toBe("/clips/a\\#1\\!.mp4")
  const template = IGNORE_TEMPLATES.find((item) => item.id === "node")!
  const first = appendIgnorePatterns("", template.patterns, template.header)
  expect(first.content).toContain("# Node and build outputs")
  expect(first.added).toEqual(template.patterns)
  expect(
    appendIgnorePatterns(first.content, template.patterns, template.header)
      .added
  ).toEqual([])
})
