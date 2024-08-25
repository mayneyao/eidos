import { LexicalEditor } from "lexical";
import { DocBlock } from "../interface";
import { FilePlugin, INSERT_FILE_COMMAND } from "./plugin";
import { $createFileNode, FileNode } from "./node";

export default {
    name: "File",
    node: FileNode,
    plugin: FilePlugin,
    icon: "File",
    keywords: ["file", "attachment"],
    onSelect: (editor: LexicalEditor) => editor.dispatchCommand(INSERT_FILE_COMMAND, { src: '', fileName: '' }),
    command: {
        create: INSERT_FILE_COMMAND,
    },
    createNode: $createFileNode,
} as DocBlock;