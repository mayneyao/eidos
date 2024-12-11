import { LexicalEditor } from "lexical"
import { DocBlock } from "../interface"
import { TableOfContentsPlugin, INSERT_TOC_COMMAND } from "./plugin"
import { $createTableOfContentsNode, TableOfContentsNode } from "./node"

export default {
    name: "Table of Contents",
    node: TableOfContentsNode,
    plugin: TableOfContentsPlugin,
    icon: "List",
    keywords: ["toc", "contents", "table of contents"],
    onSelect: (editor: LexicalEditor) =>
        editor.dispatchCommand(INSERT_TOC_COMMAND, ""),
    command: {
        create: INSERT_TOC_COMMAND,
    },
    createNode: $createTableOfContentsNode,
} as DocBlock 