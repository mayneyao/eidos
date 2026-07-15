import { describe, expect, it } from "vitest"
import { ExtensionTextDocumentError, ExtensionTextDocumentModel } from "./index"

function model(text = "- [ ] One\n- [x] Two\n") {
  return new ExtensionTextDocumentModel({
    documentId: "document-1",
    resource: {
      path: "tasks.md",
      mediaType: "text/markdown",
      languageId: "markdown",
      encoding: "utf-8",
    },
    text,
    persistedContentDigest: "sha256:first",
  })
}

describe("ExtensionTextDocumentModel", () => {
  it("serializes edits from multiple views and rejects stale revisions", () => {
    const document = model("abc")
    const first = document.applyEdits("view-a", "document-1", 1, [
      { start: 1, end: 2, text: "B" },
    ])
    expect(first).toMatchObject({
      type: "document-changed",
      originViewId: "view-a",
      revision: 2,
      dirty: true,
      edits: [{ start: 1, end: 2, text: "B" }],
    })
    expect(document.getSnapshot().text).toBe("aBc")

    expect(() =>
      document.applyEdits("view-b", "document-1", 1, [
        { start: 2, end: 3, text: "C" },
      ])
    ).toThrow("Expected document revision 2")
    const second = document.applyEdits("view-b", "document-1", 2, [
      { start: 2, end: 3, text: "C" },
    ])
    expect(second.originViewId).toBe("view-b")
    expect(document.getSnapshot()).toMatchObject({
      text: "aBC",
      revision: 3,
      canUndo: true,
    })
  })

  it("keeps shared undo and redo as minimal broadcast edits", () => {
    const document = model("A😀B")
    document.applyEdits("view-a", "document-1", 1, [
      { start: 1, end: 3, text: "x" },
    ])

    const undo = document.undo("view-b", "document-1", 2)
    expect(undo).toMatchObject({
      originViewId: "view-b",
      reason: "undo",
      edits: [{ start: 1, end: 2, text: "😀" }],
      dirty: false,
      canRedo: true,
    })
    expect(document.getSnapshot().text).toBe("A😀B")

    const redo = document.redo("view-a", "document-1", 3)
    expect(redo).toMatchObject({
      reason: "redo",
      edits: [{ start: 1, end: 3, text: "x" }],
      dirty: true,
    })
    expect(document.getSnapshot().text).toBe("AxB")
  })

  it("does not lose newer edits when an older asynchronous save completes", () => {
    const document = model("one")
    document.applyEdits("view-a", "document-1", 1, [
      { start: 3, end: 3, text: " two" },
    ])
    const firstSave = document.beginSave("document-1", 2)
    document.applyEdits("view-a", "document-1", 2, [
      { start: 7, end: 7, text: " three" },
    ])

    expect(document.completeSave(firstSave, "sha256:second")).toMatchObject({
      revision: 3,
      savedRevision: 2,
      dirty: true,
    })
    const secondSave = document.beginSave("document-1", 3)
    expect(secondSave).toMatchObject({
      text: "one two three",
      expectedPersistedContentDigest: "sha256:second",
    })
    expect(document.completeSave(secondSave, "sha256:third")).toMatchObject({
      revision: 3,
      savedRevision: 3,
      dirty: false,
    })
    expect(() => document.completeSave(secondSave, "sha256:replayed")).toThrow(
      "already consumed"
    )
  })

  it("issues bounded, single-use save tokens and supports failed-save cleanup", () => {
    const document = new ExtensionTextDocumentModel({
      documentId: "document-1",
      resource: {
        path: "tasks.md",
        mediaType: "text/markdown",
        encoding: "utf-8",
      },
      text: "one",
      persistedContentDigest: "sha256:first",
      maxPendingSaves: 1,
    })
    const token = document.beginSave("document-1", 1)
    expect(token.tokenId).toBe("save-1")
    expect(() => document.beginSave("document-1", 1)).toThrow(
      "already in flight"
    )
    expect(() =>
      document.completeSave({ ...token, text: "forged" }, "sha256:forged")
    ).toThrow("altered")
    document.cancelSave(token)
    expect(() => document.cancelSave(token)).toThrow("already consumed")
    expect(document.beginSave("document-1", 1).tokenId).toBe("save-2")
  })

  it("invalidates an in-flight save when an external conflict arrives", () => {
    const document = model("disk")
    document.applyEdits("view-a", "document-1", 1, [
      { start: 4, end: 4, text: " local" },
    ])
    const token = document.beginSave("document-1", 2)
    document.observeExternalSnapshot({
      text: "external",
      contentDigest: "sha256:external",
      size: 8,
      mtimeMs: 100,
    })

    expect(() => document.completeSave(token, "sha256:local")).toThrow(
      "changed while the save was in flight"
    )
    expect(() => document.completeSave(token, "sha256:local")).toThrow(
      "already consumed"
    )
  })

  it("accepts externally persisted local text without creating a conflict", () => {
    const document = model("disk")
    document.applyEdits("view-a", "document-1", 1, [
      { start: 4, end: 4, text: " local" },
    ])

    expect(
      document.observeExternalSnapshot({
        text: "disk local",
        contentDigest: "sha256:external-local",
        size: 10,
        mtimeMs: 100,
      })
    ).toMatchObject({
      type: "document-state",
      revision: 2,
      savedRevision: 2,
      dirty: false,
      externalConflict: undefined,
    })
  })

  it("clears a pending conflict when the external file returns to the baseline", () => {
    const document = model("disk")
    document.applyEdits("view-a", "document-1", 1, [
      { start: 4, end: 4, text: " local" },
    ])
    document.observeExternalSnapshot({
      text: "other",
      contentDigest: "sha256:other",
      size: 5,
      mtimeMs: 100,
    })

    expect(
      document.observeExternalSnapshot({
        text: "disk",
        contentDigest: "sha256:first",
        size: 4,
        mtimeMs: 200,
      })
    ).toMatchObject({
      type: "document-state",
      dirty: true,
      externalConflict: undefined,
    })
    expect(document.beginSave("document-1", 2)).toMatchObject({
      text: "disk local",
      expectedPersistedContentDigest: "sha256:first",
    })
  })

  it("reloads a clean external change and raises a host-owned dirty conflict", () => {
    const document = model("disk")
    const cleanReload = document.observeExternalSnapshot({
      text: "external",
      contentDigest: "sha256:external-1",
      size: 8,
      mtimeMs: 100,
    })
    expect(cleanReload).toMatchObject({
      type: "document-replaced",
      reason: "external-reload",
      snapshot: { text: "external", dirty: false, revision: 2 },
    })

    document.applyEdits("view-a", "document-1", 2, [
      { start: 8, end: 8, text: " local" },
    ])
    const conflict = document.observeExternalSnapshot({
      text: "external again",
      contentDigest: "sha256:external-2",
      size: 14,
      mtimeMs: 200,
    })
    expect(conflict).toMatchObject({
      type: "document-state",
      dirty: true,
      externalConflict: { contentDigest: "sha256:external-2" },
    })
    expect(() => document.beginSave("document-1", 3)).toThrow(
      "Resolve the external file conflict"
    )

    const overwrite = document.resolveExternalConflict("overwrite")
    expect(overwrite).toMatchObject({
      dirty: true,
      externalConflict: undefined,
    })
    expect(document.beginSave("document-1", 3)).toMatchObject({
      expectedPersistedContentDigest: "sha256:external-2",
      text: "external local",
    })
  })

  it("reload resolution clears history and makes the external snapshot authoritative", () => {
    const document = model("disk")
    document.applyEdits("view-a", "document-1", 1, [
      { start: 4, end: 4, text: " local" },
    ])
    document.observeExternalSnapshot({
      text: "other process",
      contentDigest: "sha256:other",
      size: 13,
      mtimeMs: 300,
    })

    const replacement = document.resolveExternalConflict("reload")
    expect(replacement).toMatchObject({
      reason: "conflict-reload",
      snapshot: {
        text: "other process",
        dirty: false,
        canUndo: false,
        canRedo: false,
        persistedContentDigest: "sha256:other",
      },
    })
  })

  it("enforces document identity, read-only state, and bounded history", () => {
    const document = new ExtensionTextDocumentModel({
      documentId: "document-1",
      resource: {
        path: "tasks.md",
        mediaType: "text/markdown",
        encoding: "utf-8",
      },
      text: "abc",
      persistedContentDigest: "sha256:first",
      maxHistoryEntries: 1,
    })
    expect(() =>
      document.applyEdits("view-a", "document-2", 1, [
        { start: 0, end: 1, text: "A" },
      ])
    ).toThrow("another document")
    expect(() =>
      document.applyEdits("", "document-1", 1, [
        { start: 0, end: 1, text: "A" },
      ])
    ).toThrow("Origin view ID")
    expect(document.getSnapshot()).toMatchObject({ text: "abc", revision: 1 })
    document.applyEdits("view-a", "document-1", 1, [
      { start: 0, end: 1, text: "A" },
    ])
    document.applyEdits("view-a", "document-1", 2, [
      { start: 1, end: 2, text: "B" },
    ])
    document.undo("view-a", "document-1", 3)
    expect(() => document.undo("view-a", "document-1", 4)).toThrow(
      "No document edit"
    )

    document.setReadOnly(true)
    try {
      document.applyEdits("view-a", "document-1", 4, [
        { start: 0, end: 0, text: "x" },
      ])
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ExtensionTextDocumentError)
      expect((error as ExtensionTextDocumentError).code).toBe("READ_ONLY")
    }
  })
})
