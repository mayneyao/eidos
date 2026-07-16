// @vitest-environment node

import { isAllowedFileSpaceUrl } from "./file-space-route-policy"

describe("file Space route policy", () => {
  it.each([
    "/",
    "/space-file#Notes%2FToday.md",
    "/space-file?heading=Intro#Notes%2FToday.md",
    "/space-file?table=tasks&record=row_1#Tasks.base",
    "/extension-panel?session=session-1",
    "/version/history",
    "/version/diff?path=Notes%2FToday.md",
    "/version/conflicts?path=Tasks.base",
    "/agent",
    "/agent/conversation-1",
    "/settings",
    "/settings/space-general",
    "https://example.com/reference",
  ])("allows %s", (url) => {
    expect(isAllowedFileSpaceUrl(url)).toBe(true)
  })

  it.each([
    "/editor#legacy",
    "/agent/conversation/extra",
    "/journals/2026-07-10",
    "/trash",
    "/graft/conflicts",
    "/version/unknown",
    "/settings/space/general",
    "not a url %",
  ])("rejects %s", (url) => {
    expect(isAllowedFileSpaceUrl(url)).toBe(false)
  })
})
