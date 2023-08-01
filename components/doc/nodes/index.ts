import { CodeHighlightNode, CodeNode } from "@lexical/code"
import { HashtagNode } from "@lexical/hashtag"
import { AutoLinkNode, LinkNode } from "@lexical/link"
import { ListItemNode, ListNode } from "@lexical/list"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"

import { ImageNode } from "./ImageNode"
import { MentionNode } from "./MentionNode"
// custom node
import { SQLNode } from "./SQL"

export const AllNodes = [
  HeadingNode,
  ListNode,
  ListItemNode,
  QuoteNode,
  CodeNode,
  CodeHighlightNode,
  AutoLinkNode,
  LinkNode,
  SQLNode,
  ImageNode,
  HashtagNode,
  MentionNode,
]
