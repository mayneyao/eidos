import {
  operationMaterializesWorktree,
  type ReadPathContentResult,
} from "@eidos.space/graft"

import { readRevisionTextDiff } from "./revision-text-reader"

describe("revision text reader", () => {
  it("keeps historical text reads non-materializing", () => {
    expect(operationMaterializesWorktree("readPathContent")).toBe(false)
  })

  it("reads the parent and commit through the public bounded SDK API", async () => {
    const calls: unknown[] = []
    const readPathContent = vi.fn(async (options) => {
      calls.push(options)
      return {
        revision: options.revision,
        path: options.path,
        kind: "text_file",
        storage: "inline",
        content: {
          state: "utf8",
          content: options.revision === "parent" ? "before" : "after",
          size: 6,
          content_hash: "hash",
        },
      } satisfies ReadPathContentResult
    })

    await expect(
      readRevisionTextDiff(
        { readPathContent },
        {
          commitId: "commit",
          parentId: "parent",
          path: "README.md",
          maxBytes: 1024,
        }
      )
    ).resolves.toEqual({
      path: "README.md",
      before: { state: "utf8", content: "before", size: 6 },
      after: { state: "utf8", content: "after", size: 6 },
    })
    expect(calls).toEqual([
      { revision: "parent", path: "README.md", maxBytes: 1024 },
      { revision: "commit", path: "README.md", maxBytes: 1024 },
    ])
  })

  it("reads a renamed file from its previous parent path", async () => {
    const calls: unknown[] = []
    const readPathContent = vi.fn(async (options) => {
      calls.push(options)
      return {
        revision: options.revision,
        path: options.path,
        kind: "text_file" as const,
        storage: "inline" as const,
        content: {
          state: "utf8" as const,
          content: "unchanged\n",
          size: 10,
          content_hash: "same-hash",
        },
      }
    })

    await expect(
      readRevisionTextDiff(
        { readPathContent },
        {
          commitId: "commit",
          parentId: "parent",
          path: "docs/new-name.md",
          previousPath: "docs/old-name.md",
          maxBytes: 1024,
        }
      )
    ).resolves.toEqual({
      path: "docs/new-name.md",
      before: { state: "utf8", content: "unchanged\n", size: 10 },
      after: { state: "utf8", content: "unchanged\n", size: 10 },
    })
    expect(calls).toEqual([
      { revision: "parent", path: "docs/old-name.md", maxBytes: 1024 },
      { revision: "commit", path: "docs/new-name.md", maxBytes: 1024 },
    ])
  })

  it("treats the parent of a root commit as absent", async () => {
    const readPathContent = vi.fn(async (options) => ({
      revision: options.revision,
      path: options.path,
      kind: "text_file" as const,
      storage: "inline" as const,
      content: {
        state: "utf8" as const,
        content: "first",
        size: 5,
        content_hash: "hash",
      },
    }))

    await expect(
      readRevisionTextDiff(
        { readPathContent },
        {
          commitId: "root",
          parentId: null,
          path: "README.md",
          maxBytes: 1024,
        }
      )
    ).resolves.toMatchObject({ before: { state: "absent" } })
    expect(readPathContent).toHaveBeenCalledOnce()
  })
})
