import { describe, expect, it } from "vitest"

import { graftSmokeCommand } from "./graft-versioning-smoke-command.cjs"

describe("graft versioning smoke command transport", () => {
  it("keeps repository initialization on the bundled CLI", () => {
    expect(graftSmokeCommand(["init", "--json"])).toEqual({
      transport: "cli",
      args: ["init", "--json"],
    })
  })

  it("routes normal repository commands through JSON pragmas", () => {
    expect(graftSmokeCommand(["status", "--json"])).toEqual({
      transport: "repository",
      pragma: "graft_json_status",
    })
    expect(graftSmokeCommand(["add", "--json", "--", "notes/a b.md"])).toEqual({
      transport: "repository",
      pragma: "graft_json_add",
      argument: '-- "notes/a b.md"',
    })
    expect(
      graftSmokeCommand(["commit", "--json", "-m", 'Write "quoted" docs'])
    ).toEqual({
      transport: "repository",
      pragma: "graft_json_commit",
      argument: 'Write "quoted" docs',
    })
    expect(graftSmokeCommand(["log", "--json"])).toEqual({
      transport: "repository",
      pragma: "graft_json_log",
      argument: "--with-status",
    })
    expect(
      graftSmokeCommand([
        "diff",
        "--json",
        "--content",
        "head-1",
        "head-2",
        "--",
        "note.md",
      ])
    ).toEqual({
      transport: "repository",
      pragma: "graft_json_diff",
      argument: '--content "head-1" "head-2" -- "note.md"',
    })
  })

  it("maps restore and branch topology commands without spawning the CLI", () => {
    expect(
      graftSmokeCommand([
        "restore",
        "--json",
        "--source",
        "HEAD~1",
        "--",
        "note.md",
      ])
    ).toEqual({
      transport: "repository",
      pragma: "graft_json_restore",
      argument: '--source "HEAD~1" -- "note.md"',
    })
    expect(graftSmokeCommand(["branch", "--json", "feature/restore"])).toEqual({
      transport: "repository",
      pragma: "graft_json_branch_create",
      argument: "feature/restore",
    })
    expect(graftSmokeCommand(["switch", "--json", "feature/restore"])).toEqual({
      transport: "repository",
      pragma: "graft_json_switch_branch",
      argument: "feature/restore",
    })
    expect(graftSmokeCommand(["merge", "--json", "feature/restore"])).toEqual({
      transport: "repository",
      pragma: "graft_json_merge",
      argument: "feature/restore",
    })
  })

  it("runs clone through a temporary Graft database", () => {
    expect(
      graftSmokeCommand(["clone", "fs:///tmp/remote", "main", "--json"])
    ).toEqual({
      transport: "clone",
      pragma: "graft_json_clone",
      argument: "fs:///tmp/remote main",
    })
  })
})
