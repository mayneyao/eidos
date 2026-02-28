import type { LexicalEditor } from "lexical"
import type { DocBlock } from "../interface"
import {
  $createMentionNode,
  MentionNode,
  MENTION_NODE_TRANSFORMER,
} from "./node"
import NewMentionsPlugin from "./plugin"

export default {
  name: "Mention",
  node: MentionNode,
  plugin: NewMentionsPlugin,
  icon: "AtSign",
  keywords: ["at", "mention", "user"],
  onSelect: (editor: LexicalEditor) => void 0,
  command: {
    create: () => void 0,
  },
  createNode: $createMentionNode,
  transform: MENTION_NODE_TRANSFORMER,
  hiddenInMenu: true,
} as DocBlock
