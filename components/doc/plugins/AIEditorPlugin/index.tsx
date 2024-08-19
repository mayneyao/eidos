import { useEffect, useMemo, useState } from "react"
import { $convertFromMarkdownString, Transformer } from "@lexical/markdown"
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

import { INSERT_MERMAID_COMMAND } from "../../blocks/mermaid/plugin"
import { useExtBlocks } from "../../hooks/use-ext-blocks"
import { allTransformers } from "../const"

export const AIEditorPlugin = (props: any) => {
  const [editor] = useLexicalComposerContext()
  const [selection, setSelection] = useState<RangeSelection | null>()
  const extBlocks = useExtBlocks()
  const __allTransformers = useMemo(() => {
    return [...extBlocks.map((block) => block.transform), ...allTransformers]
  }, [extBlocks]) as Transformer[]

  useEffect(() => {
    return mergeRegister(() => {
      // FIXME: is this only works in dev mode? fuck lexical fuck fuck fuck!!!!!!!!!
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
        editor.dispatchCommand(INSERT_MERMAID_COMMAND, text)
      })
    }
    document.addEventListener("createMermaidChart", aiComplete)
    return () => {
      document.removeEventListener("createMermaidChart", aiComplete)
    }
  }, [__allTransformers, editor, extBlocks, selection])
  useEffect(() => {
    const aiComplete = (event: Event) => {
      if (editor._config.namespace === "eidos-notes-home-page") {
        // disable AIComplete for home page's editor
        return
      }
      const text = (event as CustomEvent).detail

      editor.update(() => {
        editor.focus()
        const paragraphNode = $createParagraphNode()
        $convertFromMarkdownString(text, __allTransformers, paragraphNode)
        // FIXME: the selection is always null in production mode, append the paragraph node to the end of the root node yet
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
  }, [__allTransformers, editor, selection])

  return null
}
