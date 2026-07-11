import { describe, expect, it, vi } from "vitest"

import { GraftClient, type GraftPragmaExecutor } from "./index"

function createClient() {
  const execute = vi.fn(async () => ({ ok: true }))
  return {
    client: new GraftClient({ execute } as GraftPragmaExecutor),
    execute,
  }
}

describe("GraftClient", () => {
  it("maps status and paginated log to app-facing JSON pragmas", async () => {
    const { client, execute } = createClient()

    await client.runJson("/space", ["status", "--json"])
    await client.runJson("/space", [
      "log",
      "--json",
      "--limit",
      "25",
      "--after",
      "abc123",
    ])

    expect(execute).toHaveBeenNthCalledWith(
      1,
      "/space",
      "json_status",
      undefined
    )
    expect(execute).toHaveBeenNthCalledWith(
      2,
      "/space",
      "json_log",
      '--with-status --limit "25" --after "abc123"'
    )
  })

  it("preserves one exact repository path for add and restore", async () => {
    const { client, execute } = createClient()

    await client.runJson("/space", ["add", "--json", "--", "notes/a b.md"])
    await client.runJson("/space", [
      "restore",
      "--json",
      "--staged",
      "--expected-head",
      "head-2",
      "--",
      "notes/a b.md",
    ])

    expect(execute).toHaveBeenNthCalledWith(
      1,
      "/space",
      "json_add",
      '-- "notes/a b.md"'
    )
    expect(execute).toHaveBeenNthCalledWith(
      2,
      "/space",
      "json_restore",
      '--staged --expected-head "head-2" -- "notes/a b.md"'
    )
  })

  it("passes commit messages as one pragma argument", async () => {
    const { client, execute } = createClient()

    await client.runJson("/space", [
      "commit",
      "--json",
      "-m",
      'Write "quoted" docs',
    ])

    expect(execute).toHaveBeenCalledWith(
      "/space",
      "json_commit",
      'Write "quoted" docs'
    )
  })

  it("rejects CLI-only commands instead of silently spawning a process", async () => {
    const { client, execute } = createClient()

    await expect(client.runJson("/space", ["init", "--json"])).rejects.toThrow(
      "Unsupported persistent Graft command"
    )
    expect(execute).not.toHaveBeenCalled()
  })
})
