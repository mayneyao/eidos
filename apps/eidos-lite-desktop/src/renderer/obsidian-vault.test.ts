import { describe, expect, it, vi } from "vitest"

import type { SpacePathSearchHit } from "../shared/contracts"
import {
  missingMarkdownNotePath,
  resolveObsidianSpaceEntry,
} from "./obsidian-vault"

describe("missing Markdown note paths", () => {
  it.each([
    ["New", "wikilink", "Notes/New.md"],
    ["/New", "wikilink", "New.md"],
    ["Folder/New.md", "wikilink", "Folder/New.md"],
    ["../New", "markdown", "New.md"],
    ["New.md", "markdown", "Notes/New.md"],
  ] as const)("resolves %s (%s)", (path, syntax, expected) => {
    expect(missingMarkdownNotePath("Notes/Current.md", { path, syntax })).toBe(
      expected
    )
  })
  it.each([
    "",
    "../outside",
    "/../../outside",
    "file.eidos",
    "image.png",
    ".secret",
    "a\\b",
    "note#heading",
    "note|alias",
    "a\nb",
    "https://host/note",
    "file?.md",
  ])("does not create unsafe or non-Markdown target %s", (path) => {
    expect(
      missingMarkdownNotePath("Notes/Current.md", { path, syntax: "wikilink" })
    ).toBeNull()
  })
})

function hit(
  relativePath: string,
  kind: SpacePathSearchHit["kind"] = "file"
): SpacePathSearchHit {
  return {
    relativePath,
    name: relativePath.split("/").at(-1) ?? relativePath,
    kind,
    score: 1,
  }
}

describe("resolveObsidianSpaceEntry", () => {
  it.each(["wikilink", "markdown"] as const)(
    "resolves .eidos file links using %s syntax",
    async (syntax) => {
      await expect(
        resolveObsidianSpaceEntry(
          "index.md",
          { path: "business/customers.eidos", syntax },
          vi.fn().mockResolvedValue([hit("business/customers.eidos", "eidos")])
        )
      ).resolves.toMatchObject({
        relativePath: "business/customers.eidos",
        kind: "eidos",
      })
    }
  )
  it("resolves a completion's root note without selecting a same-folder namesake", async () => {
    await expect(
      resolveObsidianSpaceEntry(
        "Folder/Current.md",
        { path: "/Note.md", syntax: "wikilink" },
        vi.fn().mockResolvedValue([hit("Folder/Note.md"), hit("Note.md")])
      )
    ).resolves.toMatchObject({ relativePath: "Note.md" })
  })
  it("resolves explicit Vault-root paths and appends the Markdown extension", async () => {
    const search = vi
      .fn()
      .mockResolvedValue([
        hit("Archive/Project.md"),
        hit("Projects/Project.md"),
      ])

    await expect(
      resolveObsidianSpaceEntry(
        "Inbox/Current.md",
        { path: "Projects/Project", syntax: "wikilink" },
        search
      )
    ).resolves.toMatchObject({ relativePath: "Projects/Project.md" })
    expect(search).toHaveBeenCalledWith("Project", 200)
  })

  it("resolves relative Markdown links from the source note folder", async () => {
    const search = vi
      .fn()
      .mockResolvedValue([hit("Daily/Today.md"), hit("Notes/Daily/Today.md")])

    await expect(
      resolveObsidianSpaceEntry(
        "Notes/Projects/Current.md",
        { path: "../../Daily/Today.md", syntax: "markdown" },
        search
      )
    ).resolves.toMatchObject({ relativePath: "Daily/Today.md" })
  })

  it("prefers an exact same-folder basename and ignores symlinks", async () => {
    const search = vi
      .fn()
      .mockResolvedValue([
        hit("Note.md"),
        hit("Topics/Note.md", "symlink"),
        hit("Topics/Note.md"),
      ])

    await expect(
      resolveObsidianSpaceEntry(
        "Topics/Current.md",
        { path: "Note", syntax: "wikilink" },
        search
      )
    ).resolves.toMatchObject({ relativePath: "Topics/Note.md" })
  })

  it("resolves ordinary Markdown paths relative to the document without requiring ./", async () => {
    const search = vi
      .fn()
      .mockResolvedValue([hit("Daily/Today.md"), hit("Notes/Daily/Today.md")])
    await expect(
      resolveObsidianSpaceEntry(
        "Notes/Current.md",
        { path: "Daily/Today.md", syntax: "markdown" },
        search
      )
    ).resolves.toMatchObject({ relativePath: "Notes/Daily/Today.md" })
  })

  it("does not apply wiki basename fallback to a missing Markdown destination", async () => {
    const search = vi.fn().mockResolvedValue([hit("Archive/Missing.md")])
    await expect(
      resolveObsidianSpaceEntry(
        "Current.md",
        { path: "Missing.md", syntax: "markdown" },
        search
      )
    ).resolves.toBeNull()
  })

  it("does not redirect an unresolved explicit path to a same-name note", async () => {
    const search = vi.fn().mockResolvedValue([hit("Archive/Project.md")])

    await expect(
      resolveObsidianSpaceEntry(
        "Inbox/Current.md",
        { path: "Projects/Project", syntax: "wikilink" },
        search
      )
    ).resolves.toBeNull()
  })

  it("rejects links that escape the Vault before searching", async () => {
    const search = vi.fn()
    await expect(
      resolveObsidianSpaceEntry(
        "Current.md",
        { path: "../Outside.md", syntax: "markdown" },
        search
      )
    ).resolves.toBeNull()
    expect(search).not.toHaveBeenCalled()
  })
})
