import { useCallback, useEffect } from "react"
import { registerCodeHighlighting } from "@lexical/code"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useKeyPress } from "ahooks"

import { allTransformers } from "../const"

interface AutoSavePluginProps {
  onSave: (markdown: string) => void
  initContent?: string
}

export function AutoSavePlugin(props: AutoSavePluginProps) {
  const [editor] = useLexicalComposerContext()
  const { onSave, initContent } = props
  useKeyPress("ctrl.s", (e) => {
    e.preventDefault()
    handleMarkdownToggle()
  })

  useEffect(() => {
    editor.update(() => {
      $convertFromMarkdownString(initContent ?? "", allTransformers)
    })
  }, [initContent, editor])

  const handleMarkdownToggle = useCallback(() => {
    editor.update(() => {
      const markdown = $convertToMarkdownString(allTransformers)
      onSave(markdown)
    })
  }, [editor, onSave])

  return null
}
