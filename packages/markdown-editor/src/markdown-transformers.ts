import {
  CHECK_LIST,
  TRANSFORMERS,
  type ElementTransformer,
  type Transformer,
} from "@lexical/markdown"
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from "@lexical/react/LexicalHorizontalRuleNode"

import { TABLE } from "./table-transformer"

const HORIZONTAL_RULE: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node) => ($isHorizontalRuleNode(node) ? "---" : null),
  regExp: /^(---|\*\*\*|___)\s?$/u,
  replace: (parentNode, _children, _match, isImport) => {
    const rule = $createHorizontalRuleNode()
    if (isImport || parentNode.getNextSibling() !== null) {
      parentNode.replace(rule)
    } else {
      parentNode.insertBefore(rule)
    }
    if (!isImport) rule.selectNext()
  },
  type: "element",
}

/** Markdown syntax currently supported by the editor and its serializer. */
export const EIDOS_MARKDOWN_TRANSFORMERS: readonly Transformer[] = [
  TABLE,
  CHECK_LIST,
  HORIZONTAL_RULE,
  ...TRANSFORMERS,
]
