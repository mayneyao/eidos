import { CodeHighlightNode, CodeNode } from "@lexical/code"
import { HashtagNode } from "@lexical/hashtag"
import { AutoLinkNode, LinkNode } from "@lexical/link"
import { ListItemNode, ListNode } from "@lexical/list"
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
// import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";

// Change this import to be more specific and avoid circular dependencies
import { getBuiltInNodes } from "./blocks"



export const getAllNodes = () => [
  HorizontalRuleNode,
  HeadingNode,
  ListNode,
  ListItemNode,
  QuoteNode,
  CodeNode,
  CodeHighlightNode,
  AutoLinkNode,
  LinkNode,
  HashtagNode,
  // TableNode,
  // TableCellNode,
  // TableRowNode,
  // custom embed node
  // block
  ...getBuiltInNodes()
]

