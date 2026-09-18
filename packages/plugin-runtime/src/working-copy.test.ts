import { describe, expect, it, vi } from "vitest"
import { Scope } from "./lifecycle"
import {
  WorkingCopy,
  WorkingCopyRegistry,
  type DiskSnapshot,
  type DocumentBackend,
} from "./working-copy"

function fixture(encoding: DiskSnapshot["encoding"] = "utf-8") {
  let disk: DiskSnapshot = {
    text: "original",
    revision: "disk-1",
    encoding,
    bom: false,
  }
  const backend: DocumentBackend = {
    read: async () => ({ ...disk }),
    write: async (text, expected) => {
      if (expected !== disk.revision) return { status: "conflict" }
      disk = { ...disk, text, revision: `${disk.revision}+1` }
      return { status: "saved", snapshot: { ...disk } }
    },
  }
  const copy = new WorkingCopy(disk, backend)
  return {
    copy,
    backend,
    external(text: string) {
      disk = { ...disk, text, revision: `${disk.revision}+external` }
    },
  }
}
describe("shared host working copies", () => {
  it("shares content, rejects stale writes, and retains drafts after disposal", async () => {
    const { copy } = fixture()
    const aScope = new Scope()
    const a = copy.bind(aScope, "write"),
      b = copy.bind(new Scope(), "write")
    const initial = await a.read()
    await a.edit({ text: "A", expectedVersion: initial.version })
    expect(
      await b.edit({ text: "B", expectedVersion: initial.version })
    ).toMatchObject({ status: "stale", snapshot: { text: "A", dirty: true } })
    aScope.dispose()
    await expect(a.read()).rejects.toMatchObject({ code: "INSTANCE_CLOSED" })
    expect(await b.read()).toMatchObject({ text: "A", dirty: true })
  })
  it("preserves V4 when an in-flight V3 save completes", async () => {
    const { backend, copy } = fixture()
    const originalWrite = backend.write
    let release!: () => void
    backend.write = async (...args) => {
      await new Promise<void>((r) => {
        release = r
      })
      return originalWrite(...args)
    }
    const document = copy.bind(new Scope(), "write")
    await document.edit({
      text: "V3",
      expectedVersion: (await document.read()).version,
    })
    const save = document.save()
    await Promise.resolve()
    await document.edit({
      text: "V4",
      expectedVersion: (await document.read()).version,
    })
    release()
    expect(await save).toMatchObject({
      status: "saved",
      snapshot: { text: "V4", dirty: true },
    })
    expect(await backend.read()).toMatchObject({ text: "V3" })
  })
  it("reloads clean external changes and preserves dirty conflicting changes", async () => {
    const { copy, external } = fixture()
    const doc = copy.bind(new Scope(), "write")
    external("fresh")
    await copy.refresh()
    expect(await doc.read()).toMatchObject({ text: "fresh", dirty: false })
    await doc.edit({
      text: "draft",
      expectedVersion: (await doc.read()).version,
    })
    external("other")
    await copy.refresh()
    expect(await doc.save()).toMatchObject({
      status: "conflict",
      snapshot: { text: "draft", conflicted: true },
    })
  })
  it("shares undo while keeping foreign edits outside typing groups", async () => {
    const { copy } = fixture()
    const a = copy.bind(new Scope(), "write"),
      b = copy.bind(new Scope(), "write")
    for (const text of ["one", "two"])
      await a.edit({
        text,
        expectedVersion: (await a.read()).version,
        group: "typing",
      })
    await b.edit({
      text: "foreign",
      expectedVersion: (await b.read()).version,
      group: "typing",
    })
    expect((await a.undo()).text).toBe("two")
    expect((await b.undo()).text).toBe("original")
    expect((await a.redo()).text).toBe("two")
  })
  it("checks encoded bytes and write authority on every operation", async () => {
    const { copy } = fixture("utf-16le")
    const read = copy.bind(new Scope(), "read")
    await expect(read.undo()).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    })
    await expect(read.save()).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    })
    const write = copy.bind(new Scope(), "write")
    await expect(
      write.edit({
        text: "x".repeat(1024 * 1024 + 1),
        expectedVersion: (await write.read()).version,
      })
    ).rejects.toMatchObject({ code: "TOO_LARGE" })
  })
  it("delivers initial snapshot before updates and disposes subscriptions", async () => {
    vi.useFakeTimers()
    try {
      const { copy } = fixture()
      const scope = new Scope(),
        doc = copy.bind(scope, "write")
      const events: string[] = []
      const observed = doc.observe((s) => events.push(s.text))
      const version = copy.snapshot().version
      await doc.edit({ text: "update", expectedVersion: version })
      events.push((await observed).snapshot.text)
      await vi.runAllTimersAsync()
      expect(events).toEqual(["original", "update"])
      scope.dispose()
      await copy
        .bind(new Scope(), "write")
        .edit({ text: "later", expectedVersion: copy.snapshot().version })
      await vi.runAllTimersAsync()
      expect(events).toEqual(["original", "update"])
    } finally {
      vi.useRealTimers()
    }
  })
  it("deduplicates concurrent opens in one Space but never shares across Spaces", async () => {
    const registry = new WorkingCopyRegistry(),
      { backend } = fixture()
    const [a, b, c] = await Promise.all([
      registry.open("space-a", "file", backend),
      registry.open("space-a", "file", backend),
      registry.open("space-b", "file", backend),
    ])
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})
