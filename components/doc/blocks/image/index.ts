import { LexicalEditor } from "lexical";
import { DocBlock } from "../interface";
import { $createImageNode, ImageNode, IMAGE_NODE_TRANSFORMER } from "./node";
import ImagesPlugin, { INSERT_IMAGE_COMMAND } from "./plugin";


export default {
    name: "Image",
    node: ImageNode,
    plugin: ImagesPlugin,
    icon: "Image",
    keywords: ["Image", "image"],
    onSelect: (editor: LexicalEditor) => editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
        src: "",
        altText: "",
    }),
    command: {
        create: INSERT_IMAGE_COMMAND,
    },
    createNode: $createImageNode,
    transform: IMAGE_NODE_TRANSFORMER,
} as DocBlock;