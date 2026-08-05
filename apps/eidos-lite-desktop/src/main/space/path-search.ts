import fs from "node:fs/promises"
import path from "node:path"

import type { SpacePathSearchHit } from "../../shared/contracts"
import {
  flattenSpaceTree,
  isHiddenImplementationEntry,
  listSpaceTree,
} from "./space-paths"

export const SPACE_PATH_SEARCH_DEFAULT_LIMIT = 50
export const SPACE_PATH_SEARCH_MAX_LIMIT = 200

interface IndexedPath {
  relativePath: string
  name: string
  kind: SpacePathSearchHit["kind"]
  lowerPath: string
  lowerName: string
}

export function normalizeSpacePathSearchLimit(limit?: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return SPACE_PATH_SEARCH_DEFAULT_LIMIT
  }
  return Math.min(Math.max(Math.trunc(limit), 1), SPACE_PATH_SEARCH_MAX_LIMIT)
}

function scoreSubsequence(
  query: string,
  queryLower: string,
  target: string,
  targetLower: string
): number | null {
  if (!queryLower) return null
  let queryIndex = 0
  let score = 0
  let consecutive = 0
  let firstMatchIndex = -1
  for (
    let targetIndex = 0;
    targetIndex < target.length && queryIndex < query.length;
    targetIndex += 1
  ) {
    if (targetLower[targetIndex] !== queryLower[queryIndex]) continue
    if (firstMatchIndex < 0) firstMatchIndex = targetIndex
    consecutive =
      targetIndex > 0 &&
      queryIndex > 0 &&
      targetLower[targetIndex - 1] === queryLower[queryIndex - 1]
        ? consecutive + 1
        : 0
    score += 1 + consecutive * 6
    const previous = targetIndex > 0 ? target[targetIndex - 1] : ""
    const current = target[targetIndex]!
    const atBoundary =
      targetIndex === 0 ||
      previous === "/" ||
      previous === "-" ||
      previous === "_" ||
      previous === "." ||
      previous === " " ||
      (previous >= "a" && previous <= "z" && current >= "A" && current <= "Z")
    if (atBoundary) score += 8
    queryIndex += 1
  }
  if (queryIndex < query.length) return null
  if (targetLower.includes(queryLower)) score += 10
  if (targetLower.startsWith(queryLower)) score += 6
  score -= firstMatchIndex * 0.5
  score -= (target.length - query.length) * 0.05
  return score
}

export function scoreSpacePathCandidate(
  query: string,
  candidate: Pick<
    IndexedPath,
    "lowerName" | "lowerPath" | "name" | "relativePath"
  >
): number | null {
  const queryLower = query.trim().toLowerCase()
  if (!queryLower) return null
  const nameScore = scoreSubsequence(
    query,
    queryLower,
    candidate.name,
    candidate.lowerName
  )
  const pathScore = scoreSubsequence(
    query,
    queryLower,
    candidate.relativePath,
    candidate.lowerPath
  )
  const best = Math.max(
    nameScore === null ? Number.NEGATIVE_INFINITY : nameScore * 2,
    pathScore === null ? Number.NEGATIVE_INFINITY : pathScore
  )
  return best === Number.NEGATIVE_INFINITY ? null : best
}

export class SpacePathIndex {
  private entries: IndexedPath[] = []
  private readonly byPath = new Map<string, IndexedPath>()
  private scanPromise: Promise<void> | null = null

  constructor(private readonly root: string) {}

  get size(): number {
    return this.entries.length
  }

  async ensureScanned(): Promise<void> {
    this.scanPromise ??= this.scan()
    return this.scanPromise
  }

  async applyChanges(relativePaths: readonly string[]): Promise<void> {
    if (!this.scanPromise) return
    await this.scanPromise
    for (const changedPath of relativePaths) {
      const relativePath = changedPath.split("\\").join("/").replace(/^\/+/, "")
      if (!relativePath) continue
      const segments = relativePath.split("/")
      if (segments.some((segment) => isHiddenImplementationEntry(segment))) {
        this.removePath(relativePath)
        continue
      }
      this.removePath(relativePath)
      const absolutePath = path.join(this.root, ...segments)
      try {
        const stats = await fs.lstat(absolutePath)
        if (stats.isDirectory() && !stats.isSymbolicLink()) {
          await this.walkSubtree(absolutePath, relativePath)
        } else if (stats.isFile() || stats.isSymbolicLink()) {
          this.addEntry(relativePath, stats)
        }
      } catch {
        // The path no longer exists; removal above already reflects that.
      }
    }
  }

  search(query: string, limit?: number): SpacePathSearchHit[] {
    const resolvedLimit = normalizeSpacePathSearchLimit(limit)
    const scored: Array<{ entry: IndexedPath; score: number }> = []
    for (const entry of this.entries) {
      const score = scoreSpacePathCandidate(query, entry)
      if (score !== null) scored.push({ entry, score })
    }
    scored.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      if (left.entry.relativePath.length !== right.entry.relativePath.length) {
        return left.entry.relativePath.length - right.entry.relativePath.length
      }
      return left.entry.relativePath.localeCompare(right.entry.relativePath)
    })
    return scored.slice(0, resolvedLimit).map(({ entry, score }) => ({
      relativePath: entry.relativePath,
      name: entry.name,
      kind: entry.kind,
      score,
    }))
  }

  private async scan(): Promise<void> {
    const tree = await listSpaceTree(this.root)
    const next: IndexedPath[] = []
    for (const entry of flattenSpaceTree(tree)) {
      if (entry.kind === "directory") continue
      next.push(this.createEntry(entry.relativePath, entry.kind))
    }
    this.entries = next
    this.byPath.clear()
    for (const entry of next) this.byPath.set(entry.relativePath, entry)
  }

  private async walkSubtree(
    absoluteDirectory: string,
    relativeDirectory: string
  ): Promise<void> {
    let children
    try {
      children = await fs.readdir(absoluteDirectory, { withFileTypes: true })
    } catch {
      return
    }
    for (const child of children) {
      if (isHiddenImplementationEntry(child.name)) continue
      const childAbsolute = path.join(absoluteDirectory, child.name)
      const childRelative = `${relativeDirectory}/${child.name}`
      try {
        const stats = await fs.lstat(childAbsolute)
        if (stats.isDirectory() && !stats.isSymbolicLink()) {
          await this.walkSubtree(childAbsolute, childRelative)
        } else if (stats.isFile() || stats.isSymbolicLink()) {
          this.addEntry(childRelative, stats)
        }
      } catch {
        // Entry vanished mid-scan; skip it.
      }
    }
  }

  private addEntry(
    relativePath: string,
    stats: { isSymbolicLink(): boolean }
  ): void {
    const kind = stats.isSymbolicLink()
      ? "symlink"
      : path.extname(relativePath).toLowerCase() === ".eidos"
        ? "eidos"
        : "file"
    const entry = this.createEntry(relativePath, kind)
    const existingIndex = this.byPath.get(relativePath)
      ? this.entries.indexOf(this.byPath.get(relativePath)!)
      : -1
    if (existingIndex >= 0) this.entries[existingIndex] = entry
    else this.entries.push(entry)
    this.byPath.set(relativePath, entry)
  }

  private createEntry(
    relativePath: string,
    kind: SpacePathSearchHit["kind"]
  ): IndexedPath {
    const name = relativePath.split("/").at(-1) ?? relativePath
    return {
      relativePath,
      name,
      kind,
      lowerPath: relativePath.toLowerCase(),
      lowerName: name.toLowerCase(),
    }
  }

  private removePath(relativePath: string): void {
    const descendantPrefix = `${relativePath}/`
    this.entries = this.entries.filter(
      (entry) =>
        entry.relativePath !== relativePath &&
        !entry.relativePath.startsWith(descendantPrefix)
    )
    for (const key of [...this.byPath.keys()]) {
      if (key === relativePath || key.startsWith(descendantPrefix)) {
        this.byPath.delete(key)
      }
    }
  }
}
