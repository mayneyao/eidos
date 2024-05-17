import { CodeHighlightNode, CodeNode } from "@lexical/code"
import { HashtagNode } from "@lexical/hashtag"
import { AutoLinkNode, LinkNode } from "@lexical/link"
import { ListItemNode, ListNode } from "@lexical/list"
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"

import { BookmarkNode } from "./BookmarkNode"
import { CardNode } from "./CardNode"
import { DatabaseTableNode } from "./DatabaseTableNode"
import { ImageNode } from "./ImageNode/ImageNode"
import { MentionNode } from "./MentionNode"
// custom node
import { SQLNode } from "./SQLNode"
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
  BookmarkNode,
  ImageNode,
  HashtagNode,
  MentionNode,
  DatabaseTableNode,
  TableOfContentsNode,
  CardNode,
  // custom embed node
  YouTubeNode,
]
