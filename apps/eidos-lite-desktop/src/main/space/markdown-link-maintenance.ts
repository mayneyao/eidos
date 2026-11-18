import path from "node:path"
import { markdownFileLinkRanges } from "@eidos.space/markdown/source"
import type {
  SpacePathSearchHit,
  SpacePathMutationResult,
} from "../../shared/contracts"
import { resolveObsidianSpaceEntry } from "../../shared/markdown-vault-paths"
import { flattenSpaceTree, listSpaceTree } from "./space-paths"
import { readTextFilePreview, saveTextFile } from "./text-file-preview"
import type {
  ContentLinkSnapshot,
  ContentLinkUpdate,
  ContentLinkUpdateResult,
} from "../../shared/content-link-updates"

export interface MarkdownContentStore {
  read(owner: string): Promise<ContentLinkSnapshot>
  write(
    owner: string,
    update: ContentLinkUpdate
  ): Promise<ContentLinkUpdateResult>
}

export function movedPath(
  value: string,
  source: string,
  target: string
): string {
  return value === source || value.startsWith(`${source}/`)
    ? target + value.slice(source.length)
    : value
}

// The resolver only matches exact paths or basenames (with an optional .md).
// Preserve namespace order while narrowing each lookup to those candidates.
function indexLinkTargets(files: readonly SpacePathSearchHit[]) {
  const byName = new Map<string, SpacePathSearchHit[]>()
  for (const file of files) {
    const name = file.name.normalize("NFC").toLocaleLowerCase("en-US")
    for (const key of [
      name,
      ...(name.endsWith(".md") ? [name.slice(0, -3)] : []),
    ]) {
      const entries = byName.get(key)
      if (entries) entries.push(file)
      else byName.set(key, [file])
    }
  }
  return async (name: string) =>
    byName.get(name.normalize("NFC").toLocaleLowerCase("en-US")) ?? []
}

function moveLinkTargets(
  files: readonly SpacePathSearchHit[],
  moves: readonly { source: string; relativePath: string }[]
) {
  const moved = (value: string) =>
    moves.reduce(
      (path, move) => movedPath(path, move.source, move.relativePath),
      value
    )
  const before = indexLinkTargets(files)
  let after: ReturnType<typeof indexLinkTargets> | undefined
  return {
    before,
    moved,
    after: (name: string) => {
      after ??= indexLinkTargets(
        files.map((file) => {
          const relativePath = moved(file.relativePath)
          return {
            ...file,
            relativePath,
            name: path.posix.basename(relativePath),
          }
        })
      )
      return after(name)
    },
  }
}

/** Resolves against the pre-move namespace, then patches only changed destinations. */
export async function rewriteMovedMarkdownLinks(
  content: string,
  owner: string,
  source: string,
  target: string,
  files: readonly SpacePathSearchHit[],
  inputProfile: "document" | "fragment" = "document"
): Promise<string> {
  return rewriteIndexedMarkdownLinks(
    content,
    owner,
    moveLinkTargets(files, [{ source, relativePath: target }]),
    inputProfile
  )
}

async function rewriteIndexedMarkdownLinks(
  content: string,
  owner: string,
  targets: ReturnType<typeof moveLinkTargets>,
  inputProfile: "document" | "fragment" = "document",
  links = markdownFileLinkRanges(content, { inputProfile })
): Promise<string> {
  const nextOwner = targets.moved(owner)
  const replacements: { start: number; end: number; value: string }[] = []
  for (const link of links) {
    const resolved = await resolveObsidianSpaceEntry(
      owner,
      link,
      targets.before
    )
    if (!resolved || resolved.kind === "symlink") continue
    const nextTarget = targets.moved(resolved.relativePath)
    if (nextOwner === owner && nextTarget === resolved.relativePath) continue
    let value: string
    if (link.syntax === "wikilink") {
      // Preserve short names when they still resolve to the same file after the move.
      const after = await resolveObsidianSpaceEntry(
        nextOwner,
        link,
        targets.after
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
  contentEdits?: Array<{ relativePath: string; update: ContentLinkUpdate }>
}

export async function listMarkdownLinkFiles(
  root: string,
  options: Parameters<typeof listSpaceTree>[1] = {}
): Promise<SpacePathSearchHit[]> {
  const entries = flattenSpaceTree(await listSpaceTree(root, options)).filter(
    (entry) => entry.kind !== "directory" && entry.kind !== "symlink"
  )
  return entries.map((entry) => ({
    relativePath: entry.relativePath,
    name: entry.name,
    kind: entry.kind as SpacePathSearchHit["kind"],
    score: 0,
  }))
}

type ContentDocument = ContentLinkSnapshot["documents"][number]
interface LinkDocument {
  owner: string
  content: string
  revision: string
  links: ReturnType<typeof markdownFileLinkRanges>
  record?: Omit<ContentDocument, "content">
}

export interface MarkdownLinkSnapshot {
  files: readonly SpacePathSearchHit[]
  documents: LinkDocument[]
  issues: string[]
  eidosReads: number
}

/** One operation-local snapshot. Parsed ranges stay in its maintenance worker. */
export async function captureMarkdownLinkSnapshot(
  root: string,
  files: readonly SpacePathSearchHit[],
  contentStore?: MarkdownContentStore
): Promise<MarkdownLinkSnapshot> {
  const result: MarkdownLinkSnapshot = {
    files,
    documents: [],
    issues: [],
    eidosReads: 0,
  }
  for (const file of files) {
    if (
      file.kind === "eidos" &&
      contentStore &&
      !file.relativePath
        .split("/")
        .some((part) =>
          [".eidos", ".graft", ".git"].includes(part.toLowerCase())
        )
    ) {
      try {
        result.eidosReads++
        const snapshot = await contentStore.read(file.relativePath)
        const documents: LinkDocument[] = []
        for (const document of snapshot.documents) {
          const { content, ...record } = document
          documents.push({
            owner: file.relativePath,
            content,
            record,
            revision: snapshot.revision,
            links: markdownFileLinkRanges(content, {
              inputProfile: "fragment",
            }),
          })
        }
        result.documents.push(...documents)
      } catch {
        result.issues.push(file.relativePath)
      }
      continue
    }
    if (file.kind !== "file" || !/\.(?:md|markdown)$/iu.test(file.name))
      continue
    try {
      const preview = await readTextFilePreview(root, file.relativePath)
      if (preview.type !== "text" || preview.truncated) {
        result.issues.push(file.relativePath)
        continue
      }
      result.documents.push({
        owner: file.relativePath,
        content: preview.content,
        revision: preview.revision,
        links: markdownFileLinkRanges(preview.content),
      })
    } catch {
      result.issues.push(file.relativePath)
    }
  }
  return result
}

/** Map only completed renames against the original namespace; parse nothing again. */
export async function planMarkdownLinkMoves(
  snapshot: MarkdownLinkSnapshot,
  moves: readonly { source: string; relativePath: string }[],
  yieldControl?: () => Promise<void>
): Promise<MarkdownLinkPlan> {
  const targets = moveLinkTargets(snapshot.files, moves)
  const plan: MarkdownLinkPlan = {
    edits: [],
    issues: snapshot.issues.map(targets.moved),
  }
  const contentEdits = new Map<string, ContentLinkUpdate>()
  for (const document of snapshot.documents) {
    if (yieldControl) await yieldControl()
    const content = await rewriteIndexedMarkdownLinks(
      document.content,
      document.owner,
      targets,
      document.record ? "fragment" : "document",
      document.links
    )
    if (content === document.content) continue
    const relativePath = targets.moved(document.owner)
    if (document.record) {
      let update = contentEdits.get(relativePath)
      if (!update) {
        update = { revision: document.revision, documents: [] }
        contentEdits.set(relativePath, update)
      }
      update.documents.push({ ...document.record, content })
    } else
      plan.edits.push({
        relativePath,
        content,
        expectedRevision: document.revision,
      })
  }
  if (contentEdits.size)
    plan.contentEdits = [...contentEdits].map(([relativePath, update]) => ({
      relativePath,
      update,
    }))
  return plan
}

export async function prepareMarkdownLinkMove(
  root: string,
  source: string,
  target: string,
  options: Parameters<typeof listSpaceTree>[1] = {},
  contentStore?: MarkdownContentStore
): Promise<MarkdownLinkPlan> {
  const files = await listMarkdownLinkFiles(root, options)
  const snapshot = await captureMarkdownLinkSnapshot(root, files, contentStore)
  return planMarkdownLinkMoves(snapshot, [{ source, relativePath: target }])
}

/** Called inside Lite's mutation gate after the rename. Conflicts never overwrite newer bytes. */
export async function applyMarkdownLinkMove(
  root: string,
  plan: MarkdownLinkPlan,
  contentStore?: MarkdownContentStore
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
  for (const edit of plan.contentEdits ?? []) {
    try {
      if (!contentStore) throw new Error("Content link writer unavailable")
      const saved = await contentStore.write(edit.relativePath, edit.update)
      if (saved.updated) result.updatedPaths.push(edit.relativePath)
      if (saved.skipped) result.skippedPaths.push(edit.relativePath)
    } catch {
      result.skippedPaths.push(edit.relativePath)
    }
  }
  return result
}
