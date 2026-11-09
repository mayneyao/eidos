import fs from "node:fs/promises"
import path from "node:path"
import type { Stats } from "node:fs"
import type {
  ExplorerEidosSummary,
  ExplorerSummaryRequest,
} from "../../shared/explorer-summary"
import { normalizeMutableRelativePath, resolveSpacePath } from "./space-paths"

export async function readExplorerEidosSummary(
  root: string,
  request: ExplorerSummaryRequest,
  inspectFile: (filePath: string) => Promise<ExplorerEidosSummary>
): Promise<ExplorerEidosSummary | null> {
  const relativePath = normalizeMutableRelativePath(request.relativePath)
  if (!/\.eidos$/i.test(relativePath)) return null
  const canonicalRoot = await fs.realpath(root)
  if (canonicalRoot !== path.resolve(root)) throw Error("Space folder changed")
  const filePath = resolveSpacePath(canonicalRoot, relativePath)
  const inspect = async () => {
    const stats = await fs.lstat(filePath)
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      (await fs.realpath(filePath)) !== path.resolve(filePath)
    )
      throw Error("Summary requires an ordinary Space file")
    return stats
  }
  const sameVersion = (stats: Stats) =>
    stats.size === request.size && stats.mtimeMs === request.modifiedAtMs
  const before = await inspect()
  if (!sameVersion(before)) return null
  const summary = await inspectFile(filePath)
  const after = await inspect()
  return sameVersion(after) &&
    after.dev === before.dev &&
    after.ino === before.ino
    ? summary
    : null
}
