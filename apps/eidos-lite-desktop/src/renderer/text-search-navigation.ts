import type { MarkdownEditorNavigationTarget } from "@eidos.space/markdown"
import type { TextSearchTarget } from "../shared/text-search"

export type TextFileNavigationTarget = MarkdownEditorNavigationTarget & {
  textSearch?: TextSearchTarget
}
