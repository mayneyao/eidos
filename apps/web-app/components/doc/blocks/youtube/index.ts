import type { LexicalEditor } from "lexical"
import type { DocBlock } from "../interface"
import { YouTubePlugin, INSERT_YOUTUBE_COMMAND } from "./plugin"
import {
  $createYouTubeNode,
  YouTubeNode,
  YOUTUBE_NODE_TRANSFORMER,
} from "./node"

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
  transform: YOUTUBE_NODE_TRANSFORMER,
  hiddenInMenu: true,
} as DocBlock
