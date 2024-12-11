import { ElementTransformer } from "@lexical/markdown"
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from "@lexical/react/LexicalHorizontalRuleNode"
import {
  $getEditor,
  LexicalNode
} from "lexical"


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
    } else {
      line.selectNext()
    }
  },
  type: "element",
}
