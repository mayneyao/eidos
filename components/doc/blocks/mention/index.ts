import { LexicalEditor } from "lexical";
import { DocBlock } from "../interface";
import { $createMentionNode, MentionNode } from "./node";
import NewMentionsPlugin from "./plugin";


export default {
    name: "Mention",
    node: MentionNode,
    plugin: NewMentionsPlugin,
    icon: "AtSign",
    keywords: ["at", "mention", "user"],
    onSelect: (editor: LexicalEditor) => void 0,
    command: {
        create: () => void 0
    },
    createNode: $createMentionNode,
    hasChildren: true
} as DocBlock;