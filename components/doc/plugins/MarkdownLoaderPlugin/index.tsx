import { useEffect } from "react"
import { $convertFromMarkdownString } from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"

import { allTransformers } from "../const"

export const MarkdownLoaderPlugin = ({ markdown }: { markdown: string }) => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (markdown) {
      editor.update(() => {
        $convertFromMarkdownString(markdown, allTransformers)
      })
    }
  }, [editor, markdown])

  return null
}
