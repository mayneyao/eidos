import type { SpacePathSearchHit, SpaceTreeEntry } from "../shared/contracts"
import type { MarkdownEditorInternalLinkRequest } from "@eidos.space/markdown"

type SearchSpacePaths = (
  query: string,
  limit?: number
) => Promise<SpacePathSearchHit[]>

function normalizedVaultPath(
  sourceRelativePath: string,
  targetPath: string,
  syntax: MarkdownEditorInternalLinkRequest["syntax"]
): string | null {
  const value = targetPath.trim()
  if (!value || value.includes("\0") || value.includes("\\")) return null

  const relative = syntax === "markdown" && !value.startsWith("/")
  const segments = relative ? sourceRelativePath.split("/").slice(0, -1) : []
  for (const segment of value.replace(/^\/+/, "").split("/")) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      if (!relative || segments.length === 0) return null
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return segments.length > 0 ? segments.join("/") : null
}

function lower(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en-US")
}

function parentPath(relativePath: string): string {
  return relativePath.split("/").slice(0, -1).join("/")
}

function entryFromHit(hit: SpacePathSearchHit): SpaceTreeEntry {
  return {
    name: hit.name,
    relativePath: hit.relativePath,
    kind: hit.kind,
    size: 0,
    modifiedAtMs: 0,
  }
}

/** Resolves an Obsidian link without exposing the Vault filesystem to React. */
export async function resolveObsidianSpaceEntry(
  sourceRelativePath: string,
  request: Pick<MarkdownEditorInternalLinkRequest, "path" | "syntax">,
  searchSpacePaths: SearchSpacePaths
): Promise<SpaceTreeEntry | null> {
  const target = normalizedVaultPath(
    sourceRelativePath,
    request.path,
    request.syntax
  )
  if (!target) return null

  const targetName = target.split("/").at(-1) ?? target
  const hasExtension = /\.[^./]+$/u.test(targetName)
  const requestedPaths = [target, ...(hasExtension ? [] : [`${target}.md`])]
  const requested = new Set(requestedPaths.map(lower))
  const hits = (await searchSpacePaths(targetName, 200)).filter(
    (hit) => hit.kind !== "symlink"
  )
  const exact = hits.find((hit) => requested.has(lower(hit.relativePath)))
  const explicitPath = target.includes("/")
  if (explicitPath || request.syntax === "markdown") {
    return exact ? entryFromHit(exact) : null
  }

  const expectedNames = new Set(
    [targetName, ...(hasExtension ? [] : [`${targetName}.md`])].map(lower)
  )
  const sourceFolder = lower(parentPath(sourceRelativePath))
  const candidates = hits
    .filter((hit) => expectedNames.has(lower(hit.name)))
    .sort((left, right) => {
      const leftSameFolder =
        lower(parentPath(left.relativePath)) === sourceFolder
      const rightSameFolder =
        lower(parentPath(right.relativePath)) === sourceFolder
      return (
        Number(rightSameFolder) - Number(leftSameFolder) ||
        left.relativePath.split("/").length -
          right.relativePath.split("/").length ||
        left.relativePath.localeCompare(right.relativePath, undefined, {
          sensitivity: "base",
        })
      )
    })
  const match = candidates[0] ?? exact
  return match ? entryFromHit(match) : null
}
