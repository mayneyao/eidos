import { ElementTransformer } from "@lexical/markdown"
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from "@lexical/react/LexicalHorizontalRuleNode"
import { $insertNodeToNearestRoot } from "@lexical/utils"
import {
  $createParagraphNode,
  $getEditor,
  $getRoot,
  $insertNodes,
  LexicalNode,
} from "lexical"

import { $createCardNode, $isCardNode } from "../nodes/CardNode"

export const HR: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node: LexicalNode) => {
    return $isHorizontalRuleNode(node) ? "***" : null
  },
  regExp: /^(---|\*\*\*|___)\s?$/,
  replace: (parentNode, _1, _2, isImport) => {
    const line = $createHorizontalRuleNode()
    // TODO: Get rid of isImport flag
    if (isImport || parentNode.getNextSibling() != null) {
      parentNode.replace(line)
    } else {
      parentNode.insertBefore(line)
    }

    const editor = $getEditor()
    /**
     * use --- to create a card node but only works in eidos-notes namespace
     */
    if (editor._config.namespace === "eidos-notes") {
      // disable this feature for now
      return;
      if (!isImport) {
        const container = $createCardNode()
        const root = $getRoot()
        const children = root.getChildren()
        let lineIndex = children.findIndex((child, index) => child === line)
        let prevNode = children[lineIndex - 1]

        const nodes2append: LexicalNode[] = []
        while (
          prevNode &&
          !$isHorizontalRuleNode(prevNode) &&
          !$isCardNode(prevNode)
        ) {
          nodes2append.unshift(prevNode)
          lineIndex--
          prevNode = children[lineIndex]
        }
        if (nodes2append.length > 0) {
          nodes2append.forEach((node) => {
            container.append(node)
          })
        }
        if (container.getChildren().length > 0) {
          line.selectNext()
          $insertNodeToNearestRoot(container)
          line.remove()
        }
      }
    } else {
      line.selectNext()
    }
  },
  type: "element",
}
