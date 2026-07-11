import { useEffect } from "react"
import { $generateNodesFromMarkdownString } from "@lexical/mdast"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
} from "lexical"

const MARKDOWN_PATTERNS = [
  /^#{1,6}\s+/m,
  /^\s*[-+*]\s+(?:\[[ xX]\]\s+)?/m,
  /^\s*\d+[.)]\s+/m,
  /^>\s+/m,
  /^\s*(`{3,}|~{3,})/m,
  /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/m,
  /(?:\*\*|__)[^\n]+(?:\*\*|__)/,
  /(?:^|[^*])\*[^\n*]+\*/,
  /`[^\n`]+`/,
  /!?\[[^\]\n]+\]\([^\n)]+\)/,
  /^\|.+\|\s*\n\|?\s*:?-{3,}/m,
]

export function looksLikeMarkdown(text: string): boolean {
  return (
    text.trim().length > 0 &&
    MARKDOWN_PATTERNS.some((pattern) => pattern.test(text))
  )
}

/** Converts explicit or recognizable Markdown clipboard text into Lexical nodes. */
export function MarkdownPastePlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(
    () =>
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          if (!("clipboardData" in event)) return false
          const clipboard = event.clipboardData
          if (!clipboard || typeof clipboard.getData !== "function") {
            return false
          }

          const text = clipboard.getData("text/plain")
          const html = clipboard.getData("text/html")
          const types = Array.from(clipboard.types ?? [])
          const explicitMarkdown = types.includes("text/markdown")

          // Preserve browser rich-text paste when a source provides meaningful
          // HTML. Markdown conversion is for plain-text and text/markdown data.
          if (
            !explicitMarkdown &&
            html.trim().length > 0 &&
            html.trim() !== text.trim()
          ) {
            return false
          }
          if (!text || (!explicitMarkdown && !looksLikeMarkdown(text))) {
            return false
          }

          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return false

          const nodes = $generateNodesFromMarkdownString(text)
          if (nodes.length === 0) return false
          event.preventDefault()
          selection.insertNodes(nodes)
          return true
        },
        COMMAND_PRIORITY_HIGH
      ),
    [editor]
  )

  return null
}
