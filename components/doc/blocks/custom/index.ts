import { LexicalEditor } from "lexical";
import { DocBlock } from "../interface";
import { CustomBlockPlugin, INSERT_CUSTOM_BLOCK_COMMAND } from "./plugin";
import { $createCustomBlockNode, CustomBlockNode } from "./node";



export default {
    name: "Custom",
    node: CustomBlockNode,
    plugin: CustomBlockPlugin,
    icon: "ToyBrick",
    keywords: ["custom", "block", "component"],
    onSelect: (editor: LexicalEditor) => editor.dispatchCommand(INSERT_CUSTOM_BLOCK_COMMAND, ''),
    command: {
        create: INSERT_CUSTOM_BLOCK_COMMAND,
    },
    createNode: $createCustomBlockNode,
} as DocBlock;
