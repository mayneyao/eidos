import { useEffect } from "react"
import { $isListItemNode } from "@lexical/list"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $findMatchingParent } from "@lexical/utils"
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  INDENT_CONTENT_COMMAND,
  KEY_TAB_COMMAND,
  OUTDENT_CONTENT_COMMAND,
} from "lexical"

/** Keeps list indentation keyboard behavior consistent across Lexical releases. */
export function ListKeyboardPlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(
    () =>
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return false

          const anchorItem = $findMatchingParent(
            selection.anchor.getNode(),
            $isListItemNode
          )
          const focusItem = $findMatchingParent(
            selection.focus.getNode(),
            $isListItemNode
          )
          if (!anchorItem || !focusItem) return false

          event.preventDefault()
          return editor.dispatchCommand(
            event.shiftKey ? OUTDENT_CONTENT_COMMAND : INDENT_CONTENT_COMMAND,
            undefined
          )
        },
        COMMAND_PRIORITY_HIGH
      ),
    [editor]
  )

  return null
}
