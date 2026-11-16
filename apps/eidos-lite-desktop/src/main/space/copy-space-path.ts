import { constants } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import {
  normalizeMutableRelativePath,
  resolveSpaceDirectory,
  resolveSpacePath,
} from "./space-paths"

/** Copy only ordinary in-Space paths, with exclusive creation at every destination. */
export async function copySpacePath(
  root: string,
  source: string,
  target: string,
  snapshot: (sourcePath: string, destinationPath: string) => Promise<void>
): Promise<void> {
  const created: { path: string; directory: boolean }[] = []
  const copy = async (from: string, to: string): Promise<void> => {
    normalizeMutableRelativePath(from)
    normalizeMutableRelativePath(to)
    const sourcePath = resolveSpacePath(root, from)
    const destinationPath = resolveSpacePath(root, to)
    if ((await fs.realpath(sourcePath)) !== sourcePath)
      throw new Error("Space symlinks cannot be copied")
    await resolveSpaceDirectory(
      root,
      path.posix.dirname(to) === "." ? null : path.posix.dirname(to)
    )
    const stats = await fs.lstat(sourcePath)
    if (stats.isDirectory()) {
      await fs.mkdir(destinationPath)
      created.push({ path: destinationPath, directory: true })
      const names = await fs.readdir(sourcePath)
      for (const name of names) {
        // Each database is captured with its committed WAL; never copy live sidecars.
        const main = /\.eidos-(wal|shm|journal)$/i.test(name)
          ? name.replace(/-(wal|shm|journal)$/i, "")
          : name
        if (main !== name && names.includes(main)) continue
        await copy(`${from}/${name}`, `${to}/${name}`)
      }
    } else if (stats.isFile()) {
      if (/\.eidos-(wal|shm|journal)$/i.test(from))
        throw new Error("Copy the Eidos File instead of its SQLite sidecar")
      if (/\.eidos$/i.test(from)) await snapshot(sourcePath, destinationPath)
      else
        await fs.copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL)
      created.push({ path: destinationPath, directory: false })
    } else {
      throw new Error("Only ordinary files and folders can be copied")
    }
  }
  try {
    await copy(source, target)
  } catch (cause) {
    const cleanupErrors: string[] = []
    // No recursive deletion: unknown children make rmdir fail and are reported.
    for (const item of created.reverse()) {
      try {
        if (item.directory) await fs.rmdir(item.path)
        else await fs.unlink(item.path)
      } catch {
        cleanupErrors.push(path.relative(root, item.path))
      }
    }
    if (cleanupErrors.length)
      throw new Error(
        `${cause instanceof Error ? cause.message : String(cause)} Copy cleanup was incomplete: ${cleanupErrors.join(", ")}`
      )
    throw cause
  }
}
