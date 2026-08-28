import { describe, expect, it } from "vitest"

import { terminalPathInput } from "./terminal-path"

describe("terminalPathInput", () => {
  it("leaves simple POSIX paths readable", () => {
    expect(terminalPathInput("/Users/mayne/Space/notes.md", "darwin")).toBe(
      "/Users/mayne/Space/notes.md"
    )
  })

  it("quotes POSIX paths without allowing shell interpolation", () => {
    expect(
      terminalPathInput("/Users/mayne/My Space/$draft's.md", "linux")
    ).toBe("'/Users/mayne/My Space/$draft'\\''s.md'")
  })

  it("quotes Windows paths that contain shell metacharacters", () => {
    expect(terminalPathInput("C:\\My Space\\notes & ideas.md", "win32")).toBe(
      '"C:\\My Space\\notes & ideas.md"'
    )
  })
})
