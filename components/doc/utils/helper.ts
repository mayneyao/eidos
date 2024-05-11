import { CodeNode } from "@lexical/code"
import { $nodesOfType } from "lexical"

import { ExtBlock } from "../hooks/use-ext-blocks"

/**
 * some extension blocks want to transform the code with specific language to their own node
 * we cant use $convertFromMarkdownString to transform the code block, cause there are some bugs in lexical
 * https://github.com/facebook/lexical/issues/2564
 * we need to transform the code block manually, after the markdown string is converted to nodes.
 * we can replace the code block with the node created by the extension block
 *
 * if a ext block define `markdownLanguage`, it will be used to match the code block with the same language
 * @param extBlocks
 */
export const $transformExtCodeBlock = (extBlocks: ExtBlock[]) => {
  for (const code of $nodesOfType(CodeNode)) {
    const lang = code.getLanguage()
    if (lang) {
      const extBlock = extBlocks.find(
        (extBlock) => extBlock.markdownLanguage === lang
      )
      if (extBlock) {
        const node = extBlock.createNode(code.getTextContent())
        code.replace(node)
      }
    }
  }
}
