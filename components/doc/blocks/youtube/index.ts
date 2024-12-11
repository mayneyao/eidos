import { LexicalEditor } from "lexical"
import { DocBlock } from "../interface"
import { YouTubePlugin, INSERT_YOUTUBE_COMMAND } from "./plugin"
import { $createYouTubeNode, YouTubeNode } from "./node"

export default {
    name: "YouTube",
    node: YouTubeNode,
    plugin: YouTubePlugin,
    icon: "Youtube",
    keywords: ["youtube", "video", "embed"],
    onSelect: (editor: LexicalEditor) => {
        const videoId = prompt("Enter YouTube Video ID:")
        if (videoId) {
            editor.dispatchCommand(INSERT_YOUTUBE_COMMAND, { videoId })
        }
    },
    command: {
        create: INSERT_YOUTUBE_COMMAND,
    },
    createNode: $createYouTubeNode,
    hiddenInMenu: true,
} as DocBlock 