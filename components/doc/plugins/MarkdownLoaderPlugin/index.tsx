import { useEffect } from "react"
import { CodeNode } from "@lexical/code"
import { $convertFromMarkdownString } from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getRoot, $nodesOfType } from "lexical"

import { BuiltInBlocks } from "../../blocks"
import { useExtBlocks } from "../../hooks/use-ext-blocks"
import { allTransformers } from "../const"

export const MarkdownLoaderPlugin = ({ markdown }: { markdown: string }) => {
  const [editor] = useLexicalComposerContext()
  const extBlocks = useExtBlocks()

  useEffect(() => {
    if (markdown) {
      editor.update(() => {
        $convertFromMarkdownString(markdown ?? "\n", allTransformers)
        for (const code of $nodesOfType(CodeNode)) {
          const lang = code.getLanguage()
          if (lang) {
            const builtInBlock = BuiltInBlocks.find(
              (extBlock) => extBlock.markdownLanguage === lang
            )
            if (builtInBlock) {
              const node = builtInBlock.createNode(code.getTextContent())
              code.replace(node)
            }
          }
        }
        // when replace node, the selection will be lost,should select root node
        const rootNode = $getRoot()
        rootNode.select()
      })
    }
  }, [editor, extBlocks, markdown])

  return null
}
