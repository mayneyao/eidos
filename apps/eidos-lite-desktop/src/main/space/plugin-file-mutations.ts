import { constants } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { PluginError } from "@eidos.space/plugin-runtime/rpc"
import { resolveSpaceDirectory, resolveSpacePath } from "./space-paths"

// Call inside the Space mutation gate, immediately before touching the file.
export async function resolvePluginFile(root: string, relativePath: string) {
  const parent = path.posix.dirname(relativePath)
  await resolveSpaceDirectory(root, parent === "." ? null : parent)
  const fullPath = resolveSpacePath(root, relativePath)
  const stats = await fs
    .lstat(fullPath)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null
      throw error
    })
  if (stats && !stats.isFile()) {
    throw new PluginError(
      "PERMISSION_DENIED",
      "Expected a regular file; symlinks are rejected"
    )
  }
  return { fullPath, stats }
}

export async function writePluginFile(
  root: string,
  relativePath: string,
  content: string | Buffer
) {
  const { fullPath, stats } = await resolvePluginFile(root, relativePath)
  // Never truncate by path: reject a replaced leaf before modifying its inode.
  const handle = await fs.open(
    fullPath,
    stats
      ? constants.O_WRONLY | constants.O_NOFOLLOW
      : constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW
  )
  try {
    const opened = await handle.stat()
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      (stats && (opened.dev !== stats.dev || opened.ino !== stats.ino))
    ) {
      throw new PluginError(
        "PERMISSION_DENIED",
        "File changed or has multiple links"
      )
    }
    await resolvePluginFile(root, relativePath)
    await handle.truncate(0)
    await handle.writeFile(content)
  } finally {
    await handle.close()
  }
}

export async function renamePluginFile(
  root: string,
  source: string,
  target: string
) {
  const from = await resolvePluginFile(root, source)
  const to = await resolvePluginFile(root, target)
  if (!from.stats)
    throw new PluginError("DOCUMENT_UNAVAILABLE", "Source file does not exist")
  if (to.stats)
    throw new PluginError("ALREADY_EXISTS", "Target file already exists")
  // link is an atomic no-clobber operation, including when another writer creates
  // the target after validation. Keep the source if linking fails (e.g. EXDEV).
  try {
    await fs.link(from.fullPath, to.fullPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new PluginError("ALREADY_EXISTS", "Target file already exists")
    }
    throw error
  }
  await fs.unlink(from.fullPath)
}
