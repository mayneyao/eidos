import fs from "node:fs/promises"
import path from "node:path"

export async function assertSpaceRepositoryBoundary(
  root: string
): Promise<void> {
  const target = path.resolve(root)
  const local = await fs
    .lstat(path.join(target, ".graft"))
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null
      throw error
    })
  if (local) {
    if (!local.isDirectory() || local.isSymbolicLink())
      throw new Error(
        "Space versioning metadata must be an ordinary local directory"
      )
    return
  }
  let ancestor = path.dirname(target)
  while (true) {
    const exists = await fs.lstat(path.join(ancestor, ".graft")).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return false
        throw error
      }
    )
    if (exists)
      throw new Error(
        "This Space is inside another Graft repository. Choose an independent folder before enabling versioning or encrypted Sync."
      )
    if (ancestor === path.dirname(ancestor)) break
    ancestor = path.dirname(ancestor)
  }
}
