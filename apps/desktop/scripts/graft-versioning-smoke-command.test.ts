import { describe, expect, it } from "vitest"

import { graftSmokeCommand } from "./graft-versioning-smoke-command.cjs"

describe("graft versioning smoke command transport", () => {
  it.each([
    ["init", "--json"],
    ["status", "--json"],
    ["add", "--json", "notes/a b.md"],
    ["commit", "--json", "--message", 'Write "quoted" docs'],
    ["merge", "--continue", "--json", "--message", "resolved"],
    ["branch", "--json", "--set-upstream-to", "origin/main", "main"],
    ["clone", "--json", "https://example.test/v1/acme/notes"],
  ])("routes %s through the v0.8 CLI control plane", (...args) => {
    expect(graftSmokeCommand(args)).toEqual({ transport: "cli", args })
  })

  it("rejects missing commands and NUL arguments", () => {
    expect(() => graftSmokeCommand([])).toThrow("command is required")
    expect(() => graftSmokeCommand(["add", "bad\0path"])).toThrow(
      "cannot contain NUL"
    )
  })
})
