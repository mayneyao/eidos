// @vitest-environment node

import "reflect-metadata"

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { MainWindowProvider } from "../space-management/main-window.provider"
import {
  FileExtensionDocumentManager,
  type OpenFileExtensionDocumentOptions,
} from "./file-extension-document-manager"
import type { FileExtensionSurfaceMessageEvent } from "./types"

const roots: string[] = []

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "eidos-extension-document-"))
  roots.push(root)
  await writeFile(path.join(root, "tasks.md"), "- [ ] Ship\n")
  const send = vi.fn()
  const provider = {
    getWindow: () => ({ webContents: { send } }),
  } as unknown as MainWindowProvider
  const manager = new FileExtensionDocumentManager(provider)
  const options: OpenFileExtensionDocumentOptions = {
    spaceId: "space-a",
    spacePath: root,
    packageId: "example.tasks",
    editorId: "example.tasks.board",
    generation: "generation-1",
    source: "trusted source",
    path: "tasks.md",
    mediaType: "text/markdown",
    languageId: "markdown",
    editable: true,
  }
  return { root, send, manager, options }
}

function surfaceEvents(send: ReturnType<typeof vi.fn>) {
  return send.mock.calls
    .filter(([channel]) => channel === "file-extensions:surface-message")
    .map(([, event]) => event as FileExtensionSurfaceMessageEvent)
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("FileExtensionDocumentManager", () => {
  it("shares one host revision across views and rejects stale edits", async () => {
    const { manager, options, send } = await fixture()
    const first = await manager.open(options)
    const second = await manager.open(options)

    expect(second.sessionId).toBe(first.sessionId)
    expect(second.viewId).not.toBe(first.viewId)
    expect(first.snapshot).toMatchObject({ revision: 1, dirty: false })
    expect(
      manager.getRuntimeOutputTarget("space-a", first.sessionId, first.viewId)
    ).toEqual({ packageId: "example.tasks", generation: "generation-1" })
    expect(() =>
      manager.getRuntimeOutputTarget("space-a", first.sessionId, "unknown-view")
    ).toThrow("session is unavailable")

    await expect(
      manager.handleRequest("space-a", first.sessionId, first.viewId, {
        type: "apply-edits",
        requestId: "edit-1",
        documentId: first.snapshot.documentId,
        baseRevision: 1,
        edits: [{ start: 3, end: 4, text: "x" }],
      })
    ).resolves.toMatchObject({ ok: true, revision: 2 })

    const changes = surfaceEvents(send).filter(
      (event) => event.message.type === "document-changed"
    )
    expect(changes).toHaveLength(2)
    expect(new Set(changes.map((event) => event.viewId))).toEqual(
      new Set([first.viewId, second.viewId])
    )

    await expect(
      manager.handleRequest("space-a", second.sessionId, second.viewId, {
        type: "apply-edits",
        requestId: "stale-edit",
        documentId: second.snapshot.documentId,
        baseRevision: 1,
        edits: [{ start: 0, end: 0, text: "# " }],
      })
    ).resolves.toMatchObject({
      ok: false,
      revision: 2,
      error: { code: "STALE_REVISION" },
    })
  })

  it("flushes through digest CAS and keeps newer edits dirty", async () => {
    const { root, manager, options, send } = await fixture()
    const editor = await manager.open(options)

    await manager.handleRequest("space-a", editor.sessionId, editor.viewId, {
      type: "apply-edits",
      requestId: "edit-1",
      documentId: editor.snapshot.documentId,
      baseRevision: 1,
      edits: [{ start: 3, end: 4, text: "x" }],
    })
    await manager.flush("space-a", editor.sessionId, editor.viewId)

    await expect(readFile(path.join(root, "tasks.md"), "utf8")).resolves.toBe(
      "- [x] Ship\n"
    )
    expect(
      surfaceEvents(send).some(
        (event) =>
          event.message.type === "save-state" && event.message.state === "saved"
      )
    ).toBe(true)
  })

  it("turns a failed digest CAS into a host-owned external conflict", async () => {
    const { root, manager, options, send } = await fixture()
    const editor = await manager.open(options)
    await manager.handleRequest("space-a", editor.sessionId, editor.viewId, {
      type: "apply-edits",
      requestId: "edit-1",
      documentId: editor.snapshot.documentId,
      baseRevision: 1,
      edits: [{ start: 3, end: 4, text: "x" }],
    })
    await writeFile(path.join(root, "tasks.md"), "external\n")

    await expect(
      manager.flush("space-a", editor.sessionId, editor.viewId)
    ).rejects.toMatchObject({ code: "CONFLICT" })
    await expect(readFile(path.join(root, "tasks.md"), "utf8")).resolves.toBe(
      "external\n"
    )
    expect(
      surfaceEvents(send).some(
        (event) =>
          event.message.type === "document-state" &&
          Boolean(event.message.externalConflict)
      )
    ).toBe(true)

    await manager.resolveConflict(
      "space-a",
      editor.sessionId,
      editor.viewId,
      "overwrite"
    )
    await manager.flush("space-a", editor.sessionId, editor.viewId)
    await expect(readFile(path.join(root, "tasks.md"), "utf8")).resolves.toBe(
      "- [x] Ship\n"
    )
  })

  it("keeps a dirty editor recoverable when reload cannot save it", async () => {
    const { root, manager, options, send } = await fixture()
    const editor = await manager.open(options)
    await manager.handleRequest("space-a", editor.sessionId, editor.viewId, {
      type: "apply-edits",
      requestId: "edit-1",
      documentId: editor.snapshot.documentId,
      baseRevision: 1,
      edits: [{ start: 3, end: 4, text: "x" }],
    })
    await writeFile(path.join(root, "tasks.md"), "external\n")

    await expect(
      manager.flushAndDisposePackage(
        "space-a",
        "example.tasks",
        "Extension source changed"
      )
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(
      surfaceEvents(send).some((event) => event.message.type === "dispose")
    ).toBe(false)

    await expect(
      manager.resolveConflict(
        "space-a",
        editor.sessionId,
        editor.viewId,
        "overwrite"
      )
    ).resolves.toEqual({ success: true })
    await manager.flush("space-a", editor.sessionId, editor.viewId)
    await expect(readFile(path.join(root, "tasks.md"), "utf8")).resolves.toBe(
      "- [x] Ship\n"
    )
  })

  it("treats close after host disposal as idempotent", async () => {
    const { manager, options } = await fixture()
    const disposed = await manager.open(options)

    manager.disposePackage(
      "space-a",
      "example.tasks",
      "Extension source changed"
    )

    await expect(
      manager.close("space-a", disposed.sessionId, disposed.viewId)
    ).resolves.toEqual({ success: true })

    const active = await manager.open(options)
    await expect(
      manager.close("space-b", active.sessionId, active.viewId)
    ).rejects.toMatchObject({ code: "RUNTIME_STALE" })
    await expect(
      manager.close("space-a", active.sessionId, "unknown-view")
    ).rejects.toMatchObject({ code: "RUNTIME_STALE" })
  })

  it("returns protocol failures as data instead of throwing", async () => {
    const { manager, options } = await fixture()
    const editor = await manager.open(options)

    await expect(
      manager.handleRequest("space-a", editor.sessionId, editor.viewId, {
        type: "open-socket",
        requestId: "invalid-1",
      })
    ).resolves.toMatchObject({
      requestId: "invalid-1",
      ok: false,
      error: { code: "PROTOCOL_ERROR" },
    })
  })
})
