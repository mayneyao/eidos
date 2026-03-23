import { type EidosDatabase } from "@/packages/core/data-space"
import fs from "node:fs"
import path from "node:path"
import console from "electron-log"
import { resolveFsPath } from "./utils"

function* walkSync(
  absPath: string,
  virtPath: string,
  recursive: boolean = false
): Generator<{
  name: string
  path: string
  kind: string
  pathname: string
  size: number
  mtime: number
}> {
  try {
    const stats = fs.statSync(absPath)
    if (!stats.isDirectory()) return

    const entries = fs.readdirSync(absPath, {
      withFileTypes: true,
    })

    for (const entry of entries) {
      const baseVirtualPath = virtPath.endsWith("/") ? virtPath : virtPath + "/"
      const virtualEntryPath = baseVirtualPath + entry.name
      const itemAbsolutePath = path.join(absPath, entry.name)

      let size = 0
      let mtime = 0
      try {
        const itemStats = fs.statSync(itemAbsolutePath)
        size = itemStats.size
        mtime = Math.floor(itemStats.mtimeMs)
      } catch (e) {
        // Ignore stats error for individual items
      }

      const item = {
        name: entry.name,
        path: virtualEntryPath,
        pathname: "/" + virtualEntryPath,
        kind: entry.isDirectory() ? "directory" : "file",
        size,
        mtime,
      }
      yield item

      if (recursive && entry.isDirectory()) {
        yield* walkSync(itemAbsolutePath, virtualEntryPath, true)
      }
    }
  } catch (error) {
    console.error(`Error walking path ${absPath}:`, error)
  }
}

export function registerLsdir(
  db: EidosDatabase,
  projectRoot: string,
  mountMap?: Record<string, string>
) {
  try {
    db.table("lsdir", {
      columns: ["name", "path", "kind", "pathname", "size", "mtime"],
      parameters: ["target_path", "recursive"],
      rows: function* (fsPath: any, recursive: any) {
        const shouldRecursive =
          recursive === null || recursive === undefined ? false : !!recursive

        const absolutePath = resolveFsPath(fsPath, projectRoot, mountMap)

        if (absolutePath && fs.existsSync(absolutePath)) {
          yield* walkSync(absolutePath, fsPath, shouldRecursive)
        }
      },
    })
  } catch (error) {
    console.error(`Error in registerLsdir:`, error)
  }
}
