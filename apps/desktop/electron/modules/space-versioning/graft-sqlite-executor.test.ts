// @vitest-environment node

import { describe, expect, it } from "vitest"

import { graftSqlitePragmaStatement } from "./graft-sqlite-pragma"

describe("graftSqlitePragmaStatement", () => {
  it("builds query and argument forms without changing quotes", () => {
    expect(graftSqlitePragmaStatement("json_status")).toBe("graft_json_status")
    expect(
      graftSqlitePragmaStatement("json_commit", 'Write today\'s "quoted" note')
    ).toBe("graft_json_commit = 'Write today''s \"quoted\" note'")
  })

  it("rejects pragma name injection", () => {
    expect(() => graftSqlitePragmaStatement("json_status; select 1")).toThrow(
      "Invalid Graft pragma"
    )
  })
})
