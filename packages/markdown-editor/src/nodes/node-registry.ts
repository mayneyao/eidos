import { CodeNode } from "@lexical/code-core"
import { LinkNode } from "@lexical/link"
import { ListItemNode, ListNode } from "@lexical/list"
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table"
import type { Klass, LexicalNode } from "lexical"

import { EfmSourceBlockNode } from "./efm-source-block-node"
import { EfmBlockNode, EfmInlineNode } from "./efm-semantic-node"

export const MARKDOWN_EDITOR_NODES: readonly Klass<LexicalNode>[] = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  CodeNode,
  LinkNode,
  HorizontalRuleNode,
  TableNode,
  TableRowNode,
  TableCellNode,
  EfmInlineNode,
  EfmBlockNode,
  EfmSourceBlockNode,
]
