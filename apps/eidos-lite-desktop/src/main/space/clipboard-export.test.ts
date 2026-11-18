import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { existsSync } from "node:fs"
import { randomUUID } from "node:crypto"
import {
  SystemFileClipboard,
  runFileClipboardHelper,
} from "../system-file-clipboard"
import { SpaceSession } from "./space-session"
import { ClipboardExportStore } from "../clipboard-export-store"
import {
  createEidosLiteFileRuntime,
  openEidosLiteFileRuntime,
  copyEidosFileSnapshot,
} from "../../runtime/eidos-file-runtime"

it("exports only selected trees and committed database snapshots with original names, keeps ordinary files as references", async () => {
  const temporary = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-clipboard-snapshot-"))
  )
  const root = path.join(temporary, "Space")
  await fs.mkdir(path.join(root, "文件 目录"), { recursive: true })
  const sourcePath = path.join(root, "文件 目录/active.eidos")
  const initial = await createEidosLiteFileRuntime(sourcePath, "Clipboard", {
    template: "blank",
  })
  const table = initial.initialSnapshot.tables[0]!
  const field = table.fields.find((field) => field.type === "text")!
  await initial.source.insertRow(table.table.id, { [field.id]: "main" })
  await initial.close()
  const wal = new DatabaseSync(sourcePath)
  wal.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0")
  const source = await openEidosLiteFileRuntime(sourcePath)
  const mainBefore = await fs.readFile(sourcePath)
  await source.source.insertRow(table.table.id, { [field.id]: "committed WAL" })
  await fs.writeFile(
    path.join(root, "文件 目录/photo 原图.txt"),
    "original bytes"
  )
  const large = path.join(root, "large ordinary.bin")
  await fs.writeFile(large, "")
  await fs.truncate(large, 2 * 1024 ** 3) // sparse; direct file references are not budgeted as materialized bytes
  const session = await SpaceSession.create(
    root,
    path.join(temporary, "state"),
    {
      readOnly: true,
      graft: {
        backend: "sdk",
        expectedVersion: () => "test",
        hasOpenSession: () => false,
        close: async () => undefined,
      } as never,
    }
  )
  vi.spyOn(session.runtimePool, "copyFileSnapshot").mockImplementation(
    copyEidosFileSnapshot
  )
  const cache = new ClipboardExportStore(path.join(temporary, "cache"))
  const helper = path.resolve("resources/file-clipboard/eidos-file-clipboard")
  const pasteboard = `eidos-test-${randomUUID()}`
  const native = process.platform === "darwin" && existsSync(helper)
  const run = (request: Record<string, unknown>) =>
    runFileClipboardHelper(helper, request, pasteboard)
  const board = new SystemFileClipboard(helper, native, (_helper, request) =>
    run(request)
  )
  try {
    const prepared = await session.preparePathClipboard([
      "文件 目录",
      "large ordinary.bin",
    ])
    let bytes = 0
    const generation = board.reserve()
    const ownership = native ? await board.changeCount() : 1
    const exported = await session.withSystemClipboardFiles(
      prepared,
      "copy",
      (_files, exportFiles) =>
        cache.withExport(ownership, (lease) =>
          exportFiles(
            lease,
            new AbortController().signal,
            async (paths, count) => {
              bytes = count
              if (native)
                await board.write(
                  generation,
                  { paths },
                  () => undefined,
                  ownership,
                  (count) => lease.owned(count)
                )
              else await lease.owned(2)
              return paths
            }
          )
        )
    )
    expect(path.basename(exported[0]!)).toBe("文件 目录")
    expect(exported[1]).toBe(large)
    expect(bytes).toBeLessThan(1024 ** 3)
    if (native) {
      const received = (await run({ action: "inspect" })) as {
        changeCount: number
        paths: string[]
        types: string[][]
      }
      expect(received.paths).toEqual(exported)
      expect(received.types).toEqual([
        ["public.file-url", "space.eidos.file-clipboard"],
        ["public.file-url"],
      ])
    }
    const namesAtPublication = await fs.readdir(exported[0]!)
    expect(namesAtPublication).toEqual(["active.eidos", "photo 原图.txt"])
    expect(
      await fs.readFile(path.join(exported[0]!, "photo 原图.txt"), "utf8")
    ).toBe("original bytes")
    const copied = await openEidosLiteFileRuntime(
      path.join(exported[0]!, "active.eidos"),
      { readOnly: true }
    )
    try {
      const rows = await copied.source.getPage(table.table.id, 0, 100, {})
      expect(rows.rows.map((row) => row[field.id])).toEqual([
        "main",
        "committed WAL",
      ])
    } finally {
      await copied.close()
    }
    expect(await fs.readFile(sourcePath)).toEqual(mainBefore)
    expect((await fs.stat(`${sourcePath}-wal`)).size).toBeGreaterThan(0)
    await source.source.insertRow(table.table.id, {
      [field.id]: "still writable",
    })
    expect(
      (await source.source.getPage(table.table.id, 0, 100, {})).rows
    ).toHaveLength(3)
    const output = process.env.EIDOS_LITE_CLIPBOARD_EXPORT_EVIDENCE
    if (output)
      await fs.writeFile(
        output,
        JSON.stringify(
          {
            selectedFolder: "文件 目录",
            namesAtPublication,
            validationArtifactsAfterOpeningSnapshot: await fs.readdir(
              exported[0]!
            ),
            snapshotRows: 2,
            sourceRowsAfterCopy: 3,
            mainUnchanged: true,
            committedWal: true,
            nativeFileItemsVerified: native,
            ordinaryLargeFileReferencePreserved: true,
            materializedBytes: bytes,
          },
          null,
          2
        ) + "\n"
      )
  } finally {
    if (native) await run({ action: "release" })
    await session.close()
    await source.close()
    wal.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})

it("cancels, enforces quotas and rejects changed/symlink sources without publishing or deleting source data", async () => {
  const temporary = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-export-abort-"))
  )
  const root = path.join(temporary, "Space")
  await fs.mkdir(path.join(root, "folder"), { recursive: true })
  await fs.writeFile(path.join(root, "folder/source.txt"), "preserve")
  const session = await SpaceSession.create(
    root,
    path.join(temporary, "state"),
    {
      readOnly: true,
      graft: {
        backend: "sdk",
        expectedVersion: () => "test",
        hasOpenSession: () => false,
        close: async () => undefined,
      } as never,
    }
  )
  const cacheRoot = path.join(temporary, "cache")
  const cache = new ClipboardExportStore(cacheRoot)
  const publish = vi.fn(async () => undefined)
  try {
    const prepared = await session.preparePathClipboard(["folder"])
    const canceled = new AbortController()
    canceled.abort(new Error("canceled"))
    await expect(
      session.withSystemClipboardFiles(
        prepared,
        "copy",
        (_files, exportFiles) =>
          cache.withExport(1, (lease) =>
            exportFiles(lease, canceled.signal, publish)
          )
      )
    ).rejects.toThrow("canceled")
    await expect(
      session.withSystemClipboardFiles(
        prepared,
        "copy",
        (_files, exportFiles) =>
          cache.withExport(1, (lease) =>
            exportFiles(
              { ...lease, byteLimit: 1 },
              new AbortController().signal,
              publish
            )
          )
      )
    ).rejects.toThrow("size limit")
    await fs.symlink(
      path.join(root, "folder/source.txt"),
      path.join(root, "folder/link")
    )
    await expect(
      session.withSystemClipboardFiles(
        prepared,
        "copy",
        (_files, exportFiles) =>
          cache.withExport(1, (lease) =>
            exportFiles(lease, new AbortController().signal, publish)
          )
      )
    ).rejects.toThrow("symlink")
    expect(publish).not.toHaveBeenCalled()
    expect(await fs.readdir(cacheRoot)).toEqual([])
    expect(
      await fs.readFile(path.join(root, "folder/source.txt"), "utf8")
    ).toBe("preserve")
  } finally {
    await session.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
