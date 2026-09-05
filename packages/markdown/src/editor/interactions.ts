import type { MarkdownEditorInteractions } from "../types"

/** Preserve legacy defaults while allowing each interaction to be independent. */
export function resolveEditorInteractions(
  interactions: MarkdownEditorInteractions | undefined,
  showToolbar = true
): Required<MarkdownEditorInteractions> {
  return {
    toolbar: interactions?.toolbar ?? showToolbar,
    insertMenu: interactions?.insertMenu ?? showToolbar,
    blockDrag: interactions?.blockDrag ?? showToolbar,
    blockSelection: interactions?.blockSelection ?? true,
  }
}
