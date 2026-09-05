import { DocumentSession } from "./document-session"

describe("DocumentSession", () => {
  it("keeps the latest external source pending until all drafts close", () => {
    const session = new DocumentSession("Original")
    session.setCanonical("Original")
    const closeFirst = session.registerDraft()
    const closeSecond = session.registerDraft()
    expect(session.observeExternal("External 1")).toEqual({ newConflict: true })
    expect(session.observeExternal("External 2")).toEqual({
      newConflict: false,
    })
    expect(session.getAcceptedMarkdown()).toBe("Original")
    closeFirst()
    closeFirst()
    expect(session.getSnapshot().activeDrafts).toBe(1)
    expect(session.observeExternal("External 2")).toEqual({
      newConflict: false,
    })
    closeSecond()
    expect(session.observeExternal("External 2")).toEqual({
      importMarkdown: "External 2",
    })
    expect(session.getAcceptedMarkdown()).toBe("External 2")
    expect(session.getSnapshot().externalMarkdownConflict).toBe(false)
  })

  it("retains a saved local draft without reapplying the conflicting prop", () => {
    const session = new DocumentSession("Original")
    session.setCanonical("Original")
    const close = session.registerDraft()
    session.observeExternal("External")
    expect(session.commitCanonical("Local").markdown).toBe("Local")
    expect(session.observeExternal("External")).toEqual({})
    close()
    expect(session.observeExternal("External")).toEqual({})
    expect(session.getAcceptedMarkdown()).toBe("Local")
    expect(session.observeExternal("Local")).toEqual({})
    expect(session.observeExternal("New external")).toEqual({
      importMarkdown: "New external",
    })
  })

  it("applies one exact source transaction and consumes it once", () => {
    const session = new DocumentSession("A\n\n\nB\n")
    session.setCanonical("A\n\nB")
    session.queueSourceRangeCommit({
      start: 4,
      end: 5,
      expectedSource: "B",
      source: "## C",
    })
    expect(session.commitCanonical("A\n\n## C", true)).toEqual({
      markdown: "A\n\n\n## C\n",
      error: undefined,
    })
    expect(session.commitCanonical("A\n\n## C", true).markdown).toBeNull()
  })

  it("rejects stale or invalid exact intervals and reports the conflict", () => {
    for (const start of [-1, 99, 0]) {
      const session = new DocumentSession("A")
      session.setCanonical("A")
      session.queueSourceRangeCommit({
        start,
        end: 1,
        expectedSource: "stale",
        source: "Corrupt",
      })
      const result = session.commitCanonical("B", true)
      expect(result.error?.message).toMatch(/source changed/u)
      expect(result.markdown).toBe("B")
      expect(session.getAcceptedMarkdown()).not.toContain("Corrupt")
    }
  })

  it("previews a save without accepting the change or clearing a pending update", () => {
    const session = new DocumentSession("A\n\n\nB")
    session.setCanonical("A\n\nB")
    const close = session.registerDraft()
    session.observeExternal("External")
    expect(session.previewCanonical("A\n\nC")).toBe("A\n\n\nC")
    expect(session.getAcceptedMarkdown()).toBe("A\n\n\nB")
    close()
    expect(session.observeExternal("External").importMarkdown).toBe("External")
  })

  it("keeps subscriber snapshots stable between state transitions", () => {
    const session = new DocumentSession("A")
    const original = session.getSnapshot()
    const notify = vi.fn()
    const unsubscribe = session.subscribe(notify)
    session.observeExternal("A")
    expect(session.getSnapshot()).toBe(original)
    expect(notify).not.toHaveBeenCalled()
    const close = session.registerDraft()
    expect(notify).toHaveBeenCalledTimes(1)
    unsubscribe()
    close()
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("isolates source and transaction state between documents", () => {
    const first = new DocumentSession("First")
    const second = new DocumentSession("Second")
    first.registerDraft()
    first.observeExternal("New first")
    expect(second.getAcceptedMarkdown()).toBe("Second")
    expect(second.getSnapshot()).toEqual({
      activeDrafts: 0,
      externalMarkdownConflict: false,
    })
  })
})
