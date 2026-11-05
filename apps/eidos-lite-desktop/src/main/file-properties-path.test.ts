import { describe, expect, it } from "vitest"

import { filePropertiesLocationPath } from "./file-properties-path"

describe("file properties location", () => {
  it.each([
    ["D:\\", "a.md", "D:\\"],
    ["D:\\Downloads\\my-space", "a.md", "D:\\Downloads\\my-space"],
    [
      "D:\\Downloads\\my-space",
      "songs/live/a.md",
      "D:\\Downloads\\my-space\\songs\\live",
    ],
    ["D:\\我的 Space", "音乐 文件/a.md", "D:\\我的 Space\\音乐 文件"],
    ["D:\\Downloads/my-space/", "songs/a.md", "D:\\Downloads\\my-space\\songs"],
    ["\\\\server\\share", "a.md", "\\\\server\\share\\"],
    [
      "\\\\server\\share\\my-space",
      "songs/a.md",
      "\\\\server\\share\\my-space\\songs",
    ],
  ])("formats the Windows parent of %s + %s", (root, relative, expected) => {
    expect(filePropertiesLocationPath(root, relative, "win32")).toBe(expected)
  })

  it.each(["darwin", "linux"] as const)(
    "preserves POSIX names on %s",
    (platform) => {
      expect(filePropertiesLocationPath("/", "a.md", platform)).toBe("/")
      expect(
        filePropertiesLocationPath("/我的 Space", "songs\\live/a.md", platform)
      ).toBe("/我的 Space/songs\\live")
    }
  )
})
