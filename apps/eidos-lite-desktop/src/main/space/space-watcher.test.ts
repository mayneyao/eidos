import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { SpaceWatcher } from "./space-watcher"

describe("SpaceWatcher", () => {
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
