import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import {
  ClipboardExportStore,
  CLIPBOARD_EXPORT_LIMIT,
} from "./clipboard-export-store"

it("retains published files after their owner exits, preserves current ownership and gives receivers a retirement grace", async () => {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-export-store-"))
  )
  let now = 0
  const cache = path.join(root, "cache")
  const store = new ClipboardExportStore(cache, () => now)
  try {
    const file = await store.withExport(1, async (lease) => {
      const file = path.join(lease.root, "original.txt")
      await fs.writeFile(file, "copy")
      await lease.retain(4)
      await lease.owned(2)
      return file
    })
    const restarted = new ClipboardExportStore(cache, () => now)
    now = 7 * 86400000
    expect(await restarted.reclaim(2)).toBe(4)
    expect(await fs.readFile(file, "utf8")).toBe("copy")
    expect(await restarted.reclaim(3)).toBe(4)
    now += 23 * 3600000
    expect(await restarted.reclaim(3)).toBe(4)
    now += 2 * 3600000
    expect(await restarted.reclaim(3)).toBe(0)
    await expect(fs.stat(file)).rejects.toThrow()
    const outside = path.join(root, "outside")
    await fs.mkdir(outside)
    await fs.writeFile(path.join(outside, "keep"), "user data")
    await fs.symlink(outside, path.join(cache, randomUUID()))
    await fs.mkdir(path.join(cache, "unknown"))
    await restarted.reclaim(4)
    expect(await fs.readFile(path.join(outside, "keep"), "utf8")).toBe(
      "user data"
    )
    expect((await fs.stat(path.join(cache, "unknown"))).isDirectory()).toBe(
      true
    )
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

it("cleans unpublished work, retains ambiguous publications and refuses to evict unexpired copies when full", async () => {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-export-quota-"))
  )
  const store = new ClipboardExportStore(root, () => 0)
  try {
    await expect(
      store.withExport(1, async (lease) => {
        await fs.writeFile(path.join(lease.root, "partial"), "partial")
        throw new Error("canceled")
      })
    ).rejects.toThrow("canceled")
    expect(await fs.readdir(root)).toEqual([])
    const retained = await store.withExport(1, async (lease) => {
      await lease.retain(CLIPBOARD_EXPORT_LIMIT)
      return lease.root // no ownership receipt: never assume it is safe to remove
    })
    await store.withExport(2, async (lease) => {
      await lease.retain(CLIPBOARD_EXPORT_LIMIT)
      await lease.owned(3)
    })
    await expect(store.withExport(4, async () => undefined)).rejects.toThrow(
      "full"
    )
    expect((await fs.stat(retained)).isDirectory()).toBe(true)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
