import { BaseAudioNode, AUDIO_NODE_TRANSFORMER } from "./audio"
import { BaseBookmarkNode, BOOKMARK_NODE_TRANSFORMER } from "./bookmark"
import { BaseFileNode } from "./file"
import { BaseImageNode, IMAGE_NODE_TRANSFORMER } from "./image"
import { BaseMermaidNode, MERMAID_NODE_TRANSFORMER } from "./mermaid"
import { BaseVideoNode, VIDEO_NODE_TRANSFORMER } from "./video"
import { BaseYouTubeNode, YOUTUBE_NODE_TRANSFORMER } from "./youtube"
import { BaseMentionNode, MENTION_NODE_TRANSFORMER } from "./mention"
import { BaseChartNode, CHART_NODE_TRANSFORMER } from "./chart"
import { BaseSQLNode, SQL_NODE_TRANSFORMER } from "./sql"

export const getEidosNodes = () => [
  BaseMermaidNode,
  BaseImageNode,
  BaseFileNode,
  BaseVideoNode,
  BaseAudioNode,
  BaseYouTubeNode,
  BaseBookmarkNode,
  BaseMentionNode,
  BaseChartNode,
  BaseSQLNode,
]

export const getEidosTransformers = () => [
  MERMAID_NODE_TRANSFORMER,
  IMAGE_NODE_TRANSFORMER,
  BOOKMARK_NODE_TRANSFORMER,
  MENTION_NODE_TRANSFORMER,
  CHART_NODE_TRANSFORMER,
  SQL_NODE_TRANSFORMER,
  VIDEO_NODE_TRANSFORMER,
  AUDIO_NODE_TRANSFORMER,
  YOUTUBE_NODE_TRANSFORMER,
]

export * from "./mermaid"
export * from "./image"
export * from "./file"
export * from "./video"
export * from "./audio"
export * from "./youtube"
export * from "./mention"
export * from "./chart"
export * from "./sql"
export * from "./bookmark"
