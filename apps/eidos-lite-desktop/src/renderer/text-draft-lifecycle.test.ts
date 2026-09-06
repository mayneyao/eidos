import { TextDraftLifecycle } from "./text-draft-lifecycle"
import type {
  TextFileSaveRequest,
  TextFileSaveResult,
} from "../shared/contracts"

const saved = (request: TextFileSaveRequest): TextFileSaveResult => ({
  status: "saved",
  file: {
    type: "text",
    relativePath: request.relativePath,
    content: request.content,
    encoding: "utf-8",
    bom: false,
    revision: "new",
    size: request.content.length,
    modifiedAtMs: 0,
    truncated: false,
  },
})

describe("text draft exit protection", () => {
  it("saves inactive documents as well as the current document", async () => {
    const drafts = new TextDraftLifecycle()
    drafts.update("a.md", { content: "中文", revision: "a" })
    drafts.update("b.md", { content: "second", revision: "b" })
    const save = vi.fn(async (request: TextFileSaveRequest) => saved(request))
    expect(
      await drafts.prepare({
        choose: async () => "save",
        save,
        saved: () => {},
      })
    ).toBe(true)
    expect(save.mock.calls.map(([request]) => request.relativePath)).toEqual([
      "a.md",
      "b.md",
    ])
    expect(drafts.isLocked).toBe(true)
  })

  it("drains an in-flight save before prompting or saving again", async () => {
    const drafts = new TextDraftLifecycle()
    drafts.update("a.md", { content: "pending", revision: "a" })
    let finish!: () => void
    drafts.track(
      new Promise<void>((resolve) => {
        finish = () => {
          drafts.update("a.md", null)
          resolve()
        }
      })
    )
    const choose = vi.fn(async () => "save" as const)
    const save = vi.fn(async (request: TextFileSaveRequest) => saved(request))
    const preparing = drafts.prepare({ choose, save, saved: () => {} })
    await Promise.resolve()
    expect(choose).not.toHaveBeenCalled()
    finish()
    expect(await preparing).toBe(true)
    expect(save).not.toHaveBeenCalled()
  })

  it("keeps discarded drafts when another window cancels quit", async () => {
    const drafts = new TextDraftLifecycle()
    drafts.update("a.md", { content: "keep", revision: "a" })
    const save = vi.fn(async (request: TextFileSaveRequest) => saved(request))
    expect(
      await drafts.prepare({
        choose: async () => "discard",
        save,
        saved: () => {},
      })
    ).toBe(true)
    drafts.release()
    expect(
      await drafts.prepare({
        choose: async () => "cancel",
        save,
        saved: () => {},
      })
    ).toBe(false)
    expect(drafts.isLocked).toBe(false)
    await drafts.prepare({ choose: async () => "save", save, saved: () => {} })
    expect(save).toHaveBeenCalledWith({
      relativePath: "a.md",
      content: "keep",
      expectedRevision: "a",
    })
  })

  it.each(["conflict", "write failure"])(
    "blocks closure on %s and retains the failed draft",
    async (failure) => {
      const drafts = new TextDraftLifecycle()
      const conflict = vi.fn()
      drafts.onConflict(conflict)
      drafts.update("a.md", { content: "first", revision: "a" })
      drafts.update("b.md", { content: "second", revision: "b" })
      const save = vi.fn(
        async (request: TextFileSaveRequest): Promise<TextFileSaveResult> => {
          if (request.relativePath === "a.md") return saved(request)
          if (failure === "write failure") throw new Error("disk full")
          return {
            status: "conflict",
            current: {
              type: "unavailable",
              relativePath: "b.md",
              reason: "not-file",
              size: 0,
              modifiedAtMs: 0,
            },
          }
        }
      )
      await expect(
        drafts.prepare({ choose: async () => "save", save, saved: () => {} })
      ).rejects.toThrow()
      expect(drafts.isLocked).toBe(false)
      expect(conflict).toHaveBeenCalledTimes(failure === "conflict" ? 1 : 0)
      const choose = vi.fn(async () => "cancel" as const)
      await drafts.prepare({ choose, save, saved: () => {} })
      expect(choose).toHaveBeenCalledWith(["b.md"])
    }
  )
})
