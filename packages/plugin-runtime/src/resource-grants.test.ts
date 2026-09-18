import { describe, expect, it } from "vitest"
import { ResourceGrants, type TextResourceDeclaration } from "./resource-grants"
import { Scope } from "./lifecycle"

const directory = (
  access: Extract<TextResourceDeclaration, { kind: "directory" }>["access"] = [
    "list",
    "read",
    "create",
    "write",
  ],
  include = ["**/*.md"]
): TextResourceDeclaration => ({
  kind: "directory",
  title: "Journals",
  access,
  include,
})

describe("resource grants", () => {
  it("isolates global plugins' grants by Space and plugin identity", () => {
    const a = new ResourceGrants("space-a", "example.journals")
    a.bind("journal", "journals", directory())
    for (const authority of [
      new ResourceGrants("space-b", "example.journals"),
      new ResourceGrants("space-a", "example.other"),
    ])
      expect(() =>
        authority.acquire("journal", directory(), new Scope())
      ).toThrow(/not bound/)
    expect(() => a.acquire("undeclared", directory(), new Scope())).toThrow(
      /not bound/
    )
  })

  it("matches root/nested globs and intersects independently approved filters", () => {
    const authority = new ResourceGrants("space", "example.journals")
    authority.bind(
      "journal",
      "journals",
      directory(undefined, ["2026/**/*.md", "today.md"])
    )
    const lease = authority.acquire("journal", directory(), new Scope())
    expect(lease.authorize("read", "today.md")).toBe("journals/today.md")
    expect(lease.authorize("read", "2026/09/day.md")).toBe(
      "journals/2026/09/day.md"
    )
    expect(lease.includes("2026/day.md")).toBe(true)
    expect(lease.includes("2025/day.md")).toBe(false)
    expect(lease.includes("2026/private.txt")).toBe(false)
    expect(() => lease.authorize("read", "2025/day.md")).toThrow(/filters/)
  })

  it("keeps special characters literal and stars within segments", () => {
    const authority = new ResourceGrants("space", "example.journals")
    const decl = directory(["read"], ["day+(*).md"])
    authority.bind("journal", "journals", decl)
    const lease = authority.acquire("journal", decl, new Scope())
    expect(lease.includes("day+(one).md")).toBe(true)
    expect(lease.includes("day+(one/two).md")).toBe(false)
    expect(lease.includes("dayyyy.md")).toBe(false)
  })

  it("does not expand existing grants when source requests new rights", () => {
    const authority = new ResourceGrants("space", "example.journals")
    authority.bind("journal", "journals", directory(["read"]))
    const lease = authority.acquire("journal", directory(), new Scope())
    expect(lease.authorize("read", "day.md")).toBe("journals/day.md")
    for (const operation of ["list", "write", "create", "delete"] as const)
      expect(() => lease.authorize(operation, "day.md")).toThrow(/not granted/)
  })

  it("narrows an approved grant to the current declaration", () => {
    const authority = new ResourceGrants("space", "example.journals")
    authority.bind("journal", "journals", directory())
    const lease = authority.acquire(
      "journal",
      directory(["read"], ["today.md"]),
      new Scope()
    )
    expect(() => lease.authorize("write", "today.md")).toThrow(/not granted/)
    expect(lease.includes("yesterday.md")).toBe(false)
  })

  it("supports create-only and delete-only without implying read", () => {
    const authority = new ResourceGrants("space", "example.journals")
    for (const right of ["create", "delete"] as const) {
      const decl = directory([right])
      authority.bind("journal", "journals", decl)
      const lease = authority.acquire("journal", decl, new Scope())
      expect(lease.authorize(right, "day.md")).toBe("journals/day.md")
      expect(() => lease.authorize("read", "day.md")).toThrow(/not granted/)
      if (right === "delete")
        expect(lease.authorize("inspect", "day.md")).toBe("journals/day.md")
      else
        expect(() => lease.authorize("inspect", "day.md")).toThrow(
          /not granted/
        )
    }
    authority.bind("journal", "journals", directory(["delete"]))
    const mismatched = authority.acquire(
      "journal",
      directory(["read"]),
      new Scope()
    )
    expect(() => mismatched.authorize("inspect", "day.md")).toThrow(
      /not granted/
    )
  })

  it("invalidates old handles synchronously on rebind and revoke, including rollback", () => {
    const authority = new ResourceGrants("space", "example.journals")
    const first = authority.bind("journal", "journals", directory())
    const lease = authority.acquire("journal", directory(), new Scope())
    const next = authority.bind("journal", "other", directory())
    expect(next.generation).toBe(first.generation + 1)
    expect(lease.signal.aborted).toBe(true)
    expect(() => lease.authorize("read", "day.md")).toThrow(/lifetime/)
    const other = authority.acquire("journal", directory(), new Scope())
    authority.revoke("journal")
    authority.bind("journal", "journals", directory())
    expect(other.signal.aborted).toBe(true)
    expect(lease.signal.aborted).toBe(true)
  })

  it("ends view/action handles on lifetime abort without revoking other instances", () => {
    const authority = new ResourceGrants("space", "example.journals")
    authority.bind("journal", "journals", directory())
    const invocation = new Scope()
    const a = authority.acquire("journal", directory(), invocation)
    const b = authority.acquire("journal", directory(), new Scope())
    invocation.dispose()
    expect(a.signal.aborted).toBe(true)
    expect(b.signal.aborted).toBe(false)
    authority.dispose()
    expect(b.signal.aborted).toBe(true)
  })

  it("rejects path traversal and alternate separator/drive forms", () => {
    const authority = new ResourceGrants("space", "example.journals")
    authority.bind("journal", ".", directory())
    const lease = authority.acquire("journal", directory(), new Scope())
    expect(lease.authorize("read", "day.md")).toBe("day.md")
    for (const name of [
      "../secret.md",
      "/a.md",
      "a/../b.md",
      "a//b.md",
      "./a.md",
      "C:/a.md",
      "a\\b.md",
      "a\u0000.md",
      "",
    ]) {
      expect(() => lease.authorize("read", name)).toThrow(/relative/)
      expect(() => authority.bind("journal", name, directory())).toThrow(
        /relative/
      )
    }
  })

  it("takes detached declaration and grant snapshots", () => {
    const authority = new ResourceGrants("space", "example.journals")
    const decl = directory(["read"], ["today.md"])
    const grant = authority.bind("journal", "journals", decl)
    const lease = authority.acquire("journal", decl, new Scope())
    decl.access.push("write")
    grant.target = "secrets"
    grant.ceiling.access.push("write")
    expect(lease.authorize("read", "today.md")).toBe("journals/today.md")
    expect(() => lease.authorize("write", "today.md")).toThrow(/not granted/)
  })

  it("requires reapproval for kind changes and validates before revoking", () => {
    const authority = new ResourceGrants("space", "example.journals")
    authority.bind("journal", "day.md", {
      kind: "text",
      title: "Day",
      access: ["read"],
    })
    expect(() =>
      authority.acquire("journal", directory(), new Scope())
    ).toThrow(/kind/)
    const lease = authority.acquire(
      "journal",
      { kind: "text", title: "Day", access: ["read"] },
      new Scope()
    )
    expect(() =>
      authority.bind("journal", "journals", directory(["read"], ["../**"]))
    ).toThrow(/glob/)
    expect(lease.authorize("read")).toBe("day.md")
    expect(() => lease.authorize("read", "other.md")).toThrow(/child/)
  })
})
