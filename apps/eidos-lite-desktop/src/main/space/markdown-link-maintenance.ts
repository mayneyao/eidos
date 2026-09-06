import path from "node:path"
import { markdownFileLinkRanges } from "@eidos.space/markdown/source"
import type {
  SpacePathSearchHit,
  SpacePathMutationResult,
} from "../../shared/contracts"
import { resolveObsidianSpaceEntry } from "../../shared/markdown-vault-paths"
import { flattenSpaceTree, listSpaceTree } from "./space-paths"
import { readTextFilePreview, saveTextFile } from "./text-file-preview"

export function movedPath(
  value: string,
  source: string,
  target: string
): string {
  return value === source || value.startsWith(`${source}/`)
    ? target + value.slice(source.length)
    : value
}

/** Resolves against the pre-move namespace, then patches only changed destinations. */
export async function rewriteMovedMarkdownLinks(
  content: string,
  owner: string,
  source: string,
  target: string,
  files: readonly SpacePathSearchHit[]
): Promise<string> {
  const nextOwner = movedPath(owner, source, target)
  const replacements: { start: number; end: number; value: string }[] = []
  for (const link of markdownFileLinkRanges(content)) {
    const resolved = await resolveObsidianSpaceEntry(owner, link, async () => [
      ...files,
    ])
    if (!resolved || resolved.kind === "symlink") continue
    const nextTarget = movedPath(resolved.relativePath, source, target)
    if (nextOwner === owner && nextTarget === resolved.relativePath) continue
    let value: string
    if (link.syntax === "wikilink") {
      // Preserve short names when they still resolve to the same file after the move.
      const after = await resolveObsidianSpaceEntry(nextOwner, link, async () =>
        files.map((file) => {
          const relativePath = movedPath(file.relativePath, source, target)
          return {
            ...file,
            relativePath,
            name: path.posix.basename(relativePath),
          }
        })
      )
      if (after?.relativePath === nextTarget) continue
      const withoutExtension =
        !/\.[^/]+$/u.test(link.path) && /\.md$/iu.test(nextTarget)
      value =
        `/${withoutExtension ? nextTarget.slice(0, -3) : nextTarget}`.replace(
          /[%#|\[\]'\x22]/gu,
          (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
        )
    } else {
      if (
        nextTarget === resolved.relativePath &&
        (link.path.startsWith("/") ||
          path.posix.dirname(nextOwner) === path.posix.dirname(owner))
      )
        continue
      const destination = link.path.startsWith("/")
        ? `/${nextTarget}`
        : path.posix.relative(path.posix.dirname(nextOwner), nextTarget)
      value = destination
        .split("/")
        .map((segment) =>
          encodeURIComponent(segment).replace(
            /[!'()*]/gu,
            (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
          )
        )
        .join("/")
      if (link.angled) value = value.replace(/%20/gu, " ")
    }
    if (value !== content.slice(link.start, link.end))
      replacements.push({ ...link, value })
  }
  let next = content
  for (const edit of replacements.reverse())
    next = next.slice(0, edit.start) + edit.value + next.slice(edit.end)
  return next
}

interface MarkdownLinkEdit {
  relativePath: string
  content: string
  expectedRevision: string
}
export interface MarkdownLinkPlan {
  edits: MarkdownLinkEdit[]
  issues: string[]
}

export async function prepareMarkdownLinkMove(
  root: string,
  source: string,
  target: string,
  options: Parameters<typeof listSpaceTree>[1] = {}
): Promise<MarkdownLinkPlan> {
  const entries = flattenSpaceTree(await listSpaceTree(root, options)).filter(
    (entry) => entry.kind !== "directory" && entry.kind !== "symlink"
  )
  const files: SpacePathSearchHit[] = entries.map((entry) => ({
    relativePath: entry.relativePath,
    name: entry.name,
    kind: entry.kind as SpacePathSearchHit["kind"],
    score: 0,
  }))
  const plan: MarkdownLinkPlan = { edits: [], issues: [] }
  for (const file of files) {
    if (file.kind !== "file" || !/\.md$/iu.test(file.name)) continue
    try {
      const preview = await readTextFilePreview(root, file.relativePath)
      if (preview.type !== "text" || preview.truncated) {
        plan.issues.push(file.relativePath)
        continue
      }
      const content = await rewriteMovedMarkdownLinks(
        preview.content,
        file.relativePath,
        source,
        target,
        files
      )
      if (content !== preview.content)
        plan.edits.push({
          relativePath: movedPath(file.relativePath, source, target),
          content,
          expectedRevision: preview.revision,
        })
    } catch {
      plan.issues.push(file.relativePath)
    }
  }
  return plan
}

/** Called inside Lite's mutation gate after the rename. Conflicts never overwrite newer bytes. */
export async function applyMarkdownLinkMove(
  root: string,
  plan: MarkdownLinkPlan
): Promise<NonNullable<SpacePathMutationResult["markdownLinks"]>> {
  const result = {
    updatedPaths: [] as string[],
    skippedPaths: [...plan.issues],
  }
  for (const edit of plan.edits) {
    try {
      const saved = await saveTextFile(root, edit)
      if (saved.status === "saved") result.updatedPaths.push(edit.relativePath)
      else result.skippedPaths.push(edit.relativePath)
    } catch {
      result.skippedPaths.push(edit.relativePath)
    }
  }
  return result
}
