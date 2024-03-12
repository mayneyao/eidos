import { useEffect, useState } from "react"
import { $convertFromMarkdownString } from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { mergeRegister } from "@lexical/utils"
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  RangeSelection,
  SELECTION_CHANGE_COMMAND,
} from "lexical"

import { allTransformers } from "../const"

export const AIEditorPlugin = (props: any) => {
  const [editor] = useLexicalComposerContext()
  const [selection, setSelection] = useState<RangeSelection | null>()

  useEffect(() => {
    return mergeRegister(() => {
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            setSelection(selection)
          }
          return false
        },
        COMMAND_PRIORITY_LOW
      )
    })
  }, [editor])

  useEffect(() => {
    const aiComplete = (event: Event) => {
      const text = (event as CustomEvent).detail

      editor.update(() => {
        editor.focus()
        const paragraphNode = $createParagraphNode()
        $convertFromMarkdownString(text, allTransformers, paragraphNode)
        if (selection) {
          const newSelection = selection.clone()
          let node
          try {
            node = newSelection.getNodes()[0]
          } catch (error) {}
          if (node) {
            node.insertAfter(paragraphNode)
          } else {
            const root = $getRoot()
            root.append(paragraphNode)
          }
        } else {
          const root = $getRoot()
          root.append(paragraphNode)
        }
      })
    }
    document.addEventListener("AIComplete", aiComplete)
    return () => {
      document.removeEventListener("AIComplete", aiComplete)
    }
  }, [editor, selection])

  return null
}
