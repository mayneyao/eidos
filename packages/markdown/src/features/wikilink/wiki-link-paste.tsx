import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $isCodeNode } from "@lexical/code-core"
import { $isLinkNode } from "@lexical/link"
import {
  $addUpdateTag,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
  PASTE_TAG,
} from "lexical"
import { wikilinkSyntax } from "../vault-inline/syntax"

/** Keep clipboard Markdown portable, but recognize a copied reference on paste. */
export function WikiLinkPaste() {
  const [editor] = useLexicalComposerContext()
  useEffect(
    () =>
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          if (!editor.isEditable() || editor.isComposing()) return false
          const target = event.target
          if (
            target instanceof Element &&
            target.closest(
              "input, textarea, select, [data-efm-editor-interactive='true']"
            )
          )
            return false
          const data = "clipboardData" in event ? event.clipboardData : null
          // Rich clipboard payloads and files retain their existing paste behavior.
          if (
            !data ||
            data.files.length ||
            data.getData("text/html") ||
            data.getData("application/x-lexical-editor")
          )
            return false
          const source = data.getData("text/plain")
          const matches = wikilinkSyntax.scan(source, {
            protectedRanges: [],
            options: {},
          })
          if (
            matches.length !== 1 ||
            matches[0].start !== 0 ||
            matches[0].end !== source.length
          )
            return false
          const selection = $getSelection()
          if (!$isRangeSelection(selection) || selection.hasFormat("code"))
            return false
          for (const node of [
            selection.anchor.getNode(),
            selection.focus.getNode(),
            ...selection.getNodes(),
          ]) {
            if (
              ($isTextNode(node) && node.hasFormat("code")) ||
              [node, ...node.getParents()].some(
                (parent) => $isCodeNode(parent) || $isLinkNode(parent)
              )
            )
              return false
          }
          const node = wikilinkSyntax.import(source, {})
          event.preventDefault()
          $addUpdateTag(PASTE_TAG)
          $insertNodes([node])
          return true
        },
        COMMAND_PRIORITY_HIGH
      ),
    [editor]
  )
  return null
}
