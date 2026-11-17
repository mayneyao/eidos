import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { ClipboardExportStore } from "./clipboard-export-store"

it("does not reclaim an active export and reads ownership after preparation finishes", async () => {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-export-reclaim-"))
  )
  const store = new ClipboardExportStore(root)
  let ready!: () => void
  let finish!: () => void
  const started = new Promise<void>((resolve) => {
    ready = resolve
  })
  const wait = new Promise<void>((resolve) => {
    finish = resolve
  })
  const copying = store.withExport(1, async (lease) => {
    await fs.writeFile(path.join(lease.root, "file.txt"), "content")
    ready()
    await wait
    await lease.retain(7)
    await lease.owned(1)
    return lease.root
  })
  let reclaiming: Promise<number> | undefined
  try {
    await started
    const readOwnership = vi.fn(async () => 1)
    reclaiming = store.reclaim(readOwnership)
    await Promise.resolve()
    expect(readOwnership).not.toHaveBeenCalled()
    finish()
    const copied = await copying
    expect(await reclaiming).toBe(7)
    expect(await fs.readFile(path.join(copied, "file.txt"), "utf8")).toBe(
      "content"
    )
  } finally {
    finish()
    await copying.catch(() => undefined)
    await reclaiming?.catch(() => undefined)
    await fs.rm(root, { recursive: true, force: true })
  }
})
