import type { MarkdownNoteCandidate } from "../types"
import { parseObsidianWikilink } from "./obsidian-internal-link"
import { isDeniedEfmUri, normalizeEfmUri } from "./efm-uri"
import { markdownImageSource } from "./image-source"

export function droppedFileSource(file: MarkdownNoteCandidate): string | null {
  if (!file.path || /[\[\]\n\r|\\]/u.test(file.path)) return null
  if (file.imageUrl) {
    const normalized = normalizeEfmUri(file.imageUrl)
    if (
      !normalized ||
      isDeniedEfmUri(normalized) ||
      /[\r\n<>]/u.test(file.imageUrl)
    )
      return null
    return markdownImageSource(file.imageUrl, file.title)
  }
  const source = `[[${file.path}]]`
  return parseObsidianWikilink(source) ? source : null
}

/** Resolve the pointer in this editor only; callers never borrow another pane's selection. */
export function fileDropCaretRange(
  root: HTMLElement,
  x: number,
  y: number,
  shadowRoots: ShadowRoot[] = []
): Range | null {
  const owner = root.ownerDocument as Document & {
    caretPositionFromPoint?(
      x: number,
      y: number,
      options?: { shadowRoots: ShadowRoot[] }
    ): { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?(x: number, y: number): Range | null
  }
  const caret = owner.caretPositionFromPoint?.(x, y, { shadowRoots })
  let range: Range | null = null
  if (caret) {
    range = owner.createRange()
    range.setStart(caret.offsetNode, caret.offset)
    range.collapse(true)
  } else range = owner.caretRangeFromPoint?.(x, y) ?? null
  if (!range) return null
  const node = range.startContainer
  if (
    !root.contains(node) &&
    !shadowRoots.some((shadow) => shadow.contains(node))
  )
    return null
  range.collapse(true)
  return range
}
