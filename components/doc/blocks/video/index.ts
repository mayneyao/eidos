import { LexicalEditor } from "lexical";
import { INSERT_VIDEO_FILE_COMMAND, VideoPlugin } from "./plugin";
import { $createVideoNode, VideoNode } from "./node";
import { DocBlock } from "../interface";


export default {
    name: "Video",
    node: VideoNode,
    plugin: VideoPlugin,
    icon: "FileVideo",
    keywords: ["Video", "chart"],
    onSelect: (editor: LexicalEditor) => editor.dispatchCommand(INSERT_VIDEO_FILE_COMMAND, ''),
    command: {
        create: INSERT_VIDEO_FILE_COMMAND,
    },
    createNode: $createVideoNode,
} as DocBlock;