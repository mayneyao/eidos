import type { SpaceTreeEntry } from "./contracts"

/** Configuration candidates in the file's directory and its ancestors. */
export function fileMetadataConfigPaths(
  entries: readonly SpaceTreeEntry[],
  relativePath: string
): string[] {
  const directories = relativePath.split("/").slice(0, -1)
  const candidates: string[] = []
  let level = entries
  for (let depth = 0; depth <= directories.length; depth++) {
    candidates.unshift(
      ...level
        .filter(
          (entry) =>
            entry.kind === "eidos" &&
            !entry.ignored &&
            entry.relativePath !== relativePath
        )
        .map((entry) => entry.relativePath)
        .sort()
    )
    if (depth === directories.length) break
    level =
      level.find(
        (entry) =>
          entry.name === directories[depth] && entry.kind === "directory"
      )?.children ?? []
  }
  return candidates
}
