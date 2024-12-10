import { CodeHighlightNode, CodeNode } from "@lexical/code"
import { HashtagNode } from "@lexical/hashtag"
import { AutoLinkNode, LinkNode } from "@lexical/link"
import { ListItemNode, ListNode } from "@lexical/list"
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
// import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";

import { CardNode } from "./CardNode"
import { DatabaseTableNode } from "./DatabaseTableNode"
import { MentionNode } from "./MentionNode/MentionNode"
// custom node
import { BuiltInBlocks } from "../blocks"
import { SQLNode } from "./SQLNode"
import { SyncBlock } from "./SyncBlock/SyncBlock"
import { TableOfContentsNode } from "./TableOfContentsNode"
import { YouTubeNode } from "./YoutubeNode"

export const AllNodes = [
  HorizontalRuleNode,
  HeadingNode,
  ListNode,
  ListItemNode,
  QuoteNode,
  CodeNode,
  CodeHighlightNode,
  AutoLinkNode,
  LinkNode,
  SQLNode,
  HashtagNode,
  MentionNode,
  DatabaseTableNode,
  // TableNode,
  // TableCellNode,
  // TableRowNode,
  TableOfContentsNode,
  CardNode,
  // custom embed node
  YouTubeNode,
  // block
  SyncBlock,
  ...BuiltInBlocks.map(block => block.node)
]
