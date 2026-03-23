import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import {
  BaseVideoNode,
  $isBaseVideoNode,
  createVideoTransformer,
  type SerializedVideoNode,
} from "@eidos.space/lexical"
import type {
  EditorConfig,
  ElementFormatType,
  LexicalEditor,
  LexicalNode,
  NodeKey,
} from "lexical"

import { VideoComponent } from "./component"

export class VideoNode extends BaseVideoNode {
  static getType(): string {
    return "video"
  }

  static clone(node: VideoNode): VideoNode {
    return new VideoNode(node.__src, node.getFormat(), node.getKey())
  }

  constructor(src: string, format?: ElementFormatType, key?: NodeKey) {
    super(src, format, key)
  }

  static importJSON(data: SerializedVideoNode): VideoNode {
    const node = $createVideoNode(data.src)
    node.setFormat(data.format)
    return node
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    const embedBlockTheme = config.theme.embedBlock || {}
    const className = {
      base: embedBlockTheme.base || "",
      focus: embedBlockTheme.focus || "",
    }
    return (
      <BlockWithAlignableContents
        format={this.getFormat()}
        className={className}
        nodeKey={this.getKey()}
      >
        <VideoComponent url={this.__src} nodeKey={this.getKey()} />
      </BlockWithAlignableContents>
    )
  }
}

export function $createVideoNode(src: string): VideoNode {
  return new VideoNode(src)
}

export function $isVideoNode(
  node: LexicalNode | null | undefined
): node is VideoNode {
  return node instanceof VideoNode
}

export const VIDEO_NODE_TRANSFORMER = createVideoTransformer(VideoNode, (src) =>
  $createVideoNode(src)
)
