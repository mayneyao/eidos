import { describe, expect, it, vi } from "vitest"

import type { EidosFileDataSource } from "./data-source"
import {
  EidosFileHandlerRegistry,
  EidosFileHostError,
  EidosFileSession,
  type EidosFileDescriptor,
  type EidosFileDocument,
  type EidosFileHandle,
  type EidosFileRecoverySnapshot,
  type EidosFileRecoveryStore,
  type EidosFileRuntimeAdapter,
} from "./host"
import type { EidosFileSnapshot } from "./types"

const snapshot: EidosFileSnapshot = {
  path: "tasks.eidos",
  metadata: {
    format: "eidos-file",
    formatVersion: 1,
    schemaVersion: 1,
    app: "test",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
  },
  tables: [],
}

function descriptor(revision = "revision-1"): EidosFileDescriptor {
  return {
    id: "file-1",
    name: "tasks.eidos",
    format: "eidos-file",
    mimeType: "application/vnd.eidos+sqlite3",
    size: 3,
    revision,
  }
}

function source(): EidosFileDataSource {
  return {
    getSnapshot: vi.fn(async () => snapshot),
  } as unknown as EidosFileDataSource
}

function document(): EidosFileDocument {
  return {
    source: source(),
    exportBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
    close: vi.fn(),
  }
}

function handle(
  write: EidosFileHandle["write"] = vi.fn(async () => descriptor("revision-2")),
  close: EidosFileHandle["close"] = vi.fn()
): EidosFileHandle {
  return {
    capabilities: {
      read: true,
      write: true,
      saveAs: true,
      recovery: true,
      persistentFileAccess: true,
    },
    descriptor: vi.fn(async () => descriptor()),
    permission: vi.fn(async () => "granted" as const),
    read: vi.fn(async () => ({
      descriptor: descriptor(),
      bytes: new Uint8Array([1, 2, 3]).buffer,
    })),
    write,
    close,
  }
}

describe("EidosFileSession", () => {
  it("opens, marks a mutation, and saves with compare-and-swap", async () => {
    const openedDocument = document()
    const runtime: EidosFileRuntimeAdapter = {
      open: vi.fn(async () => openedDocument),
    }
    const write = vi.fn(async () => descriptor("revision-2"))
    const session = new EidosFileSession(runtime)

    await session.open(handle(write))
    session.markDirty()
    await session.save()

    expect(write).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      expect.objectContaining({ expectedRevision: "revision-1" })
    )
    expect(session.getState()).toMatchObject({
      phase: "ready",
      dirty: false,
      descriptor: { revision: "revision-2" },
    })
  })

  it("keeps the working copy dirty when the adapter reports a conflict", async () => {
    const runtime: EidosFileRuntimeAdapter = {
      open: vi.fn(async () => document()),
    }
    const actual = descriptor("external-change")
    const write = vi.fn(async () => {
      throw new EidosFileHostError("conflict", "changed", {
        expectedRevision: "revision-1",
        actual,
      })
    })
    const session = new EidosFileSession(runtime)
    await session.open(handle(write))
    session.markDirty()

    await expect(session.save()).rejects.toMatchObject({ code: "conflict" })
    expect(session.getState()).toMatchObject({
      phase: "conflict",
      dirty: true,
      conflict: { actual: { revision: "external-change" } },
    })
  })

  it("writes and clears an explicit recovery checkpoint", async () => {
    const saved = new Map<string, EidosFileRecoverySnapshot>()
    const recovery: EidosFileRecoveryStore = {
      load: vi.fn(async (id) => saved.get(id) ?? null),
      save: vi.fn(async (value) => {
        saved.set(value.id, value)
      }),
      delete: vi.fn(async (id) => {
        saved.delete(id)
      }),
    }
    const session = new EidosFileSession(
      { open: vi.fn(async () => document()) },
      recovery
    )
    await session.open(handle())
    session.markDirty()

    const checkpoint = await session.checkpoint()
    expect(checkpoint?.bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(session.getState().recoveryAvailable).toBe(true)

    await session.save()
    expect(recovery.delete).toHaveBeenCalledWith("file-1")
    expect(session.getState().recoveryAvailable).toBe(false)
  })

  it("keeps the previous working copy when replacement open fails", async () => {
    const previousDocument = document()
    const failedDocument = document()
    vi.mocked(failedDocument.source.getSnapshot).mockRejectedValue(
      new Error("invalid replacement")
    )
    const runtime: EidosFileRuntimeAdapter = {
      open: vi
        .fn()
        .mockResolvedValueOnce(previousDocument)
        .mockResolvedValueOnce(failedDocument),
    }
    const previousHandle = handle()
    const failedHandleClose = vi.fn()
    const session = new EidosFileSession(runtime)

    await session.open(previousHandle)
    await expect(
      session.open(handle(undefined, failedHandleClose))
    ).rejects.toThrow("Unable to open Eidos File")

    expect(failedDocument.close).toHaveBeenCalledOnce()
    expect(failedHandleClose).toHaveBeenCalledOnce()
    expect(previousDocument.close).not.toHaveBeenCalled()
    expect(session.getState()).toMatchObject({
      phase: "error",
      source: previousDocument.source,
    })
  })

  it("cleans both resources even when one close operation fails", async () => {
    const openedDocument = document()
    vi.mocked(openedDocument.close).mockRejectedValue(
      new Error("document close failed")
    )
    const handleClose = vi.fn()
    const session = new EidosFileSession({
      open: vi.fn(async () => openedDocument),
    })
    await session.open(handle(undefined, handleClose))

    await expect(session.close()).rejects.toThrow("document close failed")

    expect(handleClose).toHaveBeenCalledOnce()
    expect(session.getState().phase).toBe("closed")
  })
})

describe("EidosFileHandlerRegistry", () => {
  it("matches the built-in handler by extension or canonical MIME type", () => {
    const registry = new EidosFileHandlerRegistry()
    expect(
      registry.match({
        name: "tasks.eidos",
        mimeType: "application/octet-stream",
      })?.id
    ).toBe("eidos-file")
    expect(
      registry.match({
        name: "tasks.sqlite",
        mimeType: "application/vnd.eidos+sqlite3",
      })?.id
    ).toBe("eidos-file")
  })
})
