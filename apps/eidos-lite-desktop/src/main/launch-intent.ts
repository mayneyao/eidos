import fs from "node:fs/promises"
import path from "node:path"

import {
  canonicalizeSpaceRoot,
  normalizeRelativePath,
} from "./space/space-paths"

export interface EidosFileLaunchIntent {
  spaceId: string
  spaceRoot: string
  relativePath: string
}

function isEidosFilePath(value: string): boolean {
  return path.extname(value).toLowerCase() === ".eidos"
}

export function eidosFilePathsFromArguments(
  arguments_: readonly string[],
  workingDirectory: string
): string[] {
  const seen = new Set<string>()
  const paths: string[] = []
  for (const argument of arguments_) {
    if (!argument || argument.startsWith("-") || !isEidosFilePath(argument)) {
      continue
    }
    const absolutePath = path.resolve(workingDirectory, argument)
    const identity =
      process.platform === "win32" ? absolutePath.toLowerCase() : absolutePath
    if (seen.has(identity)) continue
    seen.add(identity)
    paths.push(absolutePath)
  }
  return paths
}

export async function resolveEidosFileLaunchIntent(
  requestedPath: string,
  knownSpaceRoots: readonly string[] = []
): Promise<EidosFileLaunchIntent> {
  const absolutePath = path.resolve(requestedPath)
  if (!isEidosFilePath(absolutePath)) {
    throw new Error("Only .eidos files can be opened by Eidos Lite")
  }
  const requestedStats = await fs.lstat(absolutePath)
  if (requestedStats.isSymbolicLink()) {
    throw new Error("Eidos Lite does not open an Eidos File through a symlink")
  }
  if (!requestedStats.isFile()) {
    throw new Error("The selected Eidos File is not an ordinary file")
  }
  const realFilePath = await fs.realpath(absolutePath)
  const knownSpaces = await Promise.allSettled(
    knownSpaceRoots.map((root) => canonicalizeSpaceRoot(root))
  )
  const containingSpaces = knownSpaces.flatMap((result) => {
    if (result.status === "rejected") return []
    const relative = path.relative(result.value.root, realFilePath)
    if (
      !relative ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      return []
    }
    return [result.value]
  })
  const canonical =
    containingSpaces.sort(
      (left, right) => right.root.length - left.root.length
    )[0] ?? (await canonicalizeSpaceRoot(path.dirname(realFilePath)))
  const relativePath = normalizeRelativePath(
    path.relative(canonical.root, realFilePath).split(path.sep).join("/")
  )
  return {
    spaceId: canonical.id,
    spaceRoot: canonical.root,
    relativePath,
  }
}
