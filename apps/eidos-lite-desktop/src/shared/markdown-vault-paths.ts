import type { SpacePathSearchHit, SpaceTreeEntry } from "./contracts"
import type { MarkdownEditorInternalLinkRequest } from "@eidos.space/markdown"

type SearchSpacePaths = (
  query: string,
  limit?: number
) => Promise<SpacePathSearchHit[]>

/** Missing note creation follows wiki basename locality or explicit root/relative paths. */
export function missingMarkdownNotePath(
  sourceRelativePath: string,
  request: Pick<MarkdownEditorInternalLinkRequest, "path" | "syntax">
): string | null {
  if (!request.path.trim() || /[\[\]#|\n\r\u0000-\u001f]/u.test(request.path))
    return null
  const target = normalizedVaultPath(
    sourceRelativePath,
    request.path,
    request.syntax
  )
  if (!target) return null
  const name = target.split("/").at(-1)!
  if (name.startsWith(".") || /[<>:"?*]/u.test(target)) return null
  if (/\.[^./]+$/u.test(name) && !/\.md$/iu.test(name)) return null
  const local =
    request.syntax === "wikilink" &&
    !request.path.trim().startsWith("/") &&
    !target.includes("/")
  const folder = local ? parentPath(sourceRelativePath) : ""
  return `${folder ? `${folder}/` : ""}${target}${/\.md$/iu.test(name) ? "" : ".md"}`
}

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
  const explicitPath =
    target.includes("/") || request.path.trim().startsWith("/")
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
