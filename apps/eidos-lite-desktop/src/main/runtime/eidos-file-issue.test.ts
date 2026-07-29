import { describe, expect, it } from "vitest"

import {
  classifyEidosFileIssue,
  createEidosFileIssue,
} from "./eidos-file-issue"

describe("Eidos File recovery issues", () => {
  it.each([
    [{ code: "ENOENT" }, "missing"],
    [{ code: "EACCES" }, "unreadable"],
    [{ code: "SQLITE_BUSY" }, "locked"],
    [new Error("database disk image is malformed"), "corrupt"],
    [new Error("file is not a database"), "corrupt"],
    [new Error("unexpected native open failure"), "open-failed"],
  ])("classifies %o as %s without exposing diagnostics", (source, reason) => {
    expect(classifyEidosFileIssue("data.eidos", source)).toMatchObject({
      relativePath: "data.eidos",
      reason,
      localSafe: true,
    })
  })

  it("keeps an invalidated session attached to its recovery issue", () => {
    expect(
      createEidosFileIssue("data.eidos", "replaced", "session-1")
    ).toMatchObject({
      sessionId: "session-1",
      retryable: true,
      canReviewHistory: true,
    })
  })

  it("allows an explicit retry after a missing file is restored", () => {
    expect(createEidosFileIssue("data.eidos", "missing")).toMatchObject({
      retryable: true,
      canReveal: false,
      localSafe: true,
    })
  })
})
