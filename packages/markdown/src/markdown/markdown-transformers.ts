import {
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  CHECK_LIST,
  CODE,
  HEADING,
  HIGHLIGHT,
  INLINE_CODE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  LINK,
  ORDERED_LIST,
  QUOTE,
  STRIKETHROUGH,
  UNORDERED_LIST,
  type ElementTransformer,
  type Transformer,
} from "@lexical/markdown"
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from "@lexical/react/LexicalHorizontalRuleNode"

import { TABLE } from "./table-transformer"

export const HORIZONTAL_RULE: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node) => ($isHorizontalRuleNode(node) ? "---" : null),
  regExp: /^ {0,3}((?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/u,
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
  HEADING,
  QUOTE,
  UNORDERED_LIST,
  ORDERED_LIST,
  CODE,
  INLINE_CODE,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  STRIKETHROUGH,
  HIGHLIGHT,
  LINK,
]
