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
      undefined,
      {}
    )
    expect(execute).toHaveBeenNthCalledWith(
      2,
      "/space",
      "json_log",
      '--with-status --limit "25" --after "abc123"',
      {}
    )
  })

  it("preserves one exact repository path for add and restore", async () => {
    const { client, execute } = createClient()

    await client.runJson("/space", ["add", "--json", "--", "notes/a b.md"])
    await client.runJson("/space", [
      "add",
      "--json",
      "--with-status",
      "--expected-head",
      "head-2",
      "--",
      "notes/a b.md",
    ])
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
      '-- "notes/a b.md"',
      {}
    )
    expect(execute).toHaveBeenNthCalledWith(
      2,
      "/space",
      "json_add",
      '--with-status --expected-head "head-2" -- "notes/a b.md"',
      {}
    )
    expect(execute).toHaveBeenNthCalledWith(
      3,
      "/space",
      "json_restore",
      '--staged --expected-head "head-2" -- "notes/a b.md"',
      {}
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
      'Write "quoted" docs',
      {}
    )

    await client.runJson("/space", [
      "merge-continue",
      "--json",
      "Merge remote versions",
    ])
    expect(execute).toHaveBeenLastCalledWith(
      "/space",
      "json_merge_continue",
      "Merge remote versions",
      {}
    )
  })

  it("maps remote configuration and preserves local URLs with spaces", async () => {
    const { client, execute } = createClient()

    await client.runJson("/space", ["remote", "list", "--json"])
    await client.runJson("/space", [
      "remote",
      "add",
      "--json",
      "origin",
      "fs:///tmp/Eidos Remote",
    ])
    await client.runJson("/space", [
      "remote",
      "set-url",
      "--json",
      "origin",
      "graft+https://example.test/spaces/demo",
    ])
    await client.runJson("/space", ["remote", "remove", "--json", "origin"])

    expect(execute).toHaveBeenNthCalledWith(
      1,
      "/space",
      "json_remotes",
      undefined,
      {}
    )
    expect(execute).toHaveBeenNthCalledWith(
      2,
      "/space",
      "json_remote_add",
      "origin fs:///tmp/Eidos Remote",
      {}
    )
    expect(execute).toHaveBeenNthCalledWith(
      3,
      "/space",
      "json_remote_set_url",
      "origin graft+https://example.test/spaces/demo",
      {}
    )
    expect(execute).toHaveBeenNthCalledWith(
      4,
      "/space",
      "json_remote_remove",
      "origin",
      {}
    )
  })

  it("maps persistent fetch, pull, push, upstream, and conflict commands", async () => {
    const { client, execute } = createClient()

    await client.runJson("/space", ["fetch", "--json", "origin", "main"])
    await client.runJson("/space", ["pull", "--json", "origin", "main"])
    await client.runJson("/space", ["push", "--json", "origin", "main"])
    await client.runJson("/space", [
      "branch-upstream",
      "--json",
      "main",
      "origin/main",
    ])
    await client.runJson("/space", ["conflicts", "--json"])
    await client.runJson("/space", [
      "resolve",
      "--json",
      "--theirs",
      "notes/a b.md",
    ])

    expect(execute.mock.calls).toEqual([
      ["/space", "json_fetch", "origin main", {}],
      ["/space", "json_pull", "origin main", {}],
      ["/space", "json_push", "origin main", {}],
      ["/space", "json_branch_upstream", "main origin/main", {}],
      ["/space", "json_conflicts", undefined, {}],
      ["/space", "json_resolve_conflict", "--theirs notes/a b.md", {}],
    ])
  })

  it("passes execution limits to the persistent executor", async () => {
    const { client, execute } = createClient()

    await client.runJson("/space", ["status", "--json"], {
      timeoutMs: 2_000,
      maxBufferBytes: 4_096,
    })

    expect(execute).toHaveBeenCalledWith("/space", "json_status", undefined, {
      timeoutMs: 2_000,
      maxBufferBytes: 4_096,
    })
  })

  it("rejects ambiguous remote names and unsupported sync flags", async () => {
    const { client, execute } = createClient()

    await expect(
      client.runJson("/space", [
        "remote",
        "add",
        "--json",
        "bad name",
        "memory",
      ])
    ).rejects.toThrow("one non-empty word")
    await expect(
      client.runJson("/space", ["pull", "--json", "--force"])
    ).rejects.toThrow("Unsupported Graft pull flag")
    expect(execute).not.toHaveBeenCalled()
  })

  it("rejects CLI-only commands instead of silently spawning a process", async () => {
    const { client, execute } = createClient()

    await expect(client.runJson("/space", ["init", "--json"])).rejects.toThrow(
      "Unsupported persistent Graft command"
    )
    expect(execute).not.toHaveBeenCalled()
  })
})
