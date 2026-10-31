import fs from "node:fs/promises"
import nativeFs, { type FSWatcher } from "node:fs"
import { EventEmitter } from "node:events"
import os from "node:os"
import path from "node:path"

import { SpaceWatcher } from "./space-watcher"

describe("SpaceWatcher", () => {
  it("retries interrupted registration and retains a working watcher", () => {
    const native = Object.assign(new EventEmitter(), {
      close: vi.fn(),
      ref: vi.fn(),
      unref: vi.fn(),
    })
    const interrupted = Object.assign(new Error("interrupted"), {
      code: "EINTR",
    })
    const watch = vi
      .spyOn(nativeFs, "watch")
      .mockImplementationOnce(() => {
        throw interrupted
      })
      .mockImplementationOnce(() => {
        throw interrupted
      })
      .mockReturnValue(native as FSWatcher)
    const refresh = vi.fn()
    const watcher = new SpaceWatcher("/space", refresh)
    try {
      expect(() => watcher.start()).not.toThrow()
      expect(watch).toHaveBeenCalledTimes(3)
      watcher.start()
      expect(watch).toHaveBeenCalledTimes(3)
      native.emit("error", new Error("refresh"))
      expect(refresh).toHaveBeenCalledWith([])
      watcher.close()
      expect(native.close).toHaveBeenCalledOnce()
    } finally {
      watcher.close()
      watch.mockRestore()
    }
  })

  it.each([
    ["EINTR", 3],
    ["EACCES", 1],
    ["ENOENT", 1],
  ] as const)(
    "surfaces persistent %s after %s attempts without an infinite retry",
    (code, attempts) => {
      const error = Object.assign(new Error(code), { code })
      const watch = vi.spyOn(nativeFs, "watch").mockImplementation(() => {
        throw error
      })
      const watcher = new SpaceWatcher("/space", vi.fn())
      try {
        expect(() => watcher.start()).toThrow(error)
        expect(watch).toHaveBeenCalledTimes(attempts)
        watcher.close()
        watcher.start()
        expect(watch).toHaveBeenCalledTimes(attempts)
      } finally {
        watcher.close()
        watch.mockRestore()
      }
    }
  )

  it.skipIf(process.platform === "win32")(
    "does not refresh the Space for ignored filesystem activity",
    async () => {
      const root = await fs.mkdtemp(
        path.join(os.tmpdir(), "eidos-space-watcher-ignore-")
      )
      await fs.mkdir(path.join(root, "node_modules"))
      let changes = 0
      let changedPaths: readonly string[] = []
      const watcher = new SpaceWatcher(
        root,
        (relativePaths) => {
          changes += 1
          changedPaths = relativePaths
        },
        25,
        async (relativePaths) =>
          new Set(
            relativePaths.filter((relativePath) =>
              relativePath.startsWith("node_modules")
            )
          )
      )

      try {
        watcher.start()
        await fs.writeFile(path.join(root, "node_modules", "ignored.js"), "x")
        await new Promise((resolve) => setTimeout(resolve, 150))
        expect(changes).toBe(0)

        await fs.writeFile(path.join(root, "visible.txt"), "visible")
        await vi.waitFor(() => expect(changes).toBe(1), { timeout: 2_000 })
        expect(changedPaths).toContain("visible.txt")
      } finally {
        watcher.close()
        await fs.rm(root, { recursive: true, force: true })
      }
    }
  )
})
