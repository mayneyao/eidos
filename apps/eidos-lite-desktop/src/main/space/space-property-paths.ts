import fs from "node:fs/promises"
import path from "node:path"
import {
  resolveSpaceDirectory,
  resolveSpacePath,
  normalizeMutableRelativePath,
  isHiddenImplementationEntry,
} from "./space-paths"

export function propertyPaths(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 100 ||
    value.some((item) => typeof item !== "string")
  )
    throw new Error("Select between 1 and 100 files or folders")
  return [
    ...new Set(
      value.map((item: string) =>
        item === "." ? item : normalizeMutableRelativePath(item)
      )
    ),
  ]
}

export async function resolvePropertyEntry(root: string, requested: string) {
  const relativePath =
    requested === "." ? "." : normalizeMutableRelativePath(requested)
  if (relativePath === ".")
    return {
      fullPath: await resolveSpaceDirectory(root, null),
      stats: await fs.lstat(root),
    }
  if (relativePath.split("/").some(isHiddenImplementationEntry))
    throw new Error("Space implementation files cannot have properties")
  const parent = path.posix.dirname(relativePath)
  await resolveSpaceDirectory(root, parent === "." ? null : parent)
  const fullPath = resolveSpacePath(root, relativePath)
  const stats = await fs.lstat(fullPath)
  if (!stats.isFile() && !stats.isDirectory())
    throw new Error(
      "Properties require a file or folder; symlinks are rejected"
    )
  return { fullPath, stats }
}
