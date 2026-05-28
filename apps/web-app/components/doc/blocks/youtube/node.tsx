import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import {
  BaseYouTubeNode,
  $isBaseYouTubeNode,
  createYouTubeTransformer,
  type SerializedYouTubeNode,
} from "@eidos.space/lexical"
import {
  $applyNodeReplacement,
  type EditorConfig,
  type ElementFormatType,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical"

import { YouTubeComponent } from "./component"

export class YouTubeNode extends BaseYouTubeNode {
  static getType(): string {
    return "youtube"
  }

  static clone(node: YouTubeNode): YouTubeNode {
    return new YouTubeNode(node.__id, node.getFormat(), node.getKey())
  }

  constructor(id: string, format?: ElementFormatType, key?: NodeKey) {
    super(id, format, key)
  }

  static importJSON(serializedNode: SerializedYouTubeNode): YouTubeNode {
    const node = $createYouTubeNode(serializedNode.videoID)
    node.setFormat(serializedNode.format)
    return node
  }

  updateDOM(): false {
    return false
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
        <YouTubeComponent
          className={className}
          format={this.getFormat()}
          nodeKey={this.getKey()}
          videoID={this.__id}
        />
      </BlockWithAlignableContents>
    )
  }
}

export function $createYouTubeNode(videoID: string): YouTubeNode {
  return $applyNodeReplacement(new YouTubeNode(videoID))
}

export function $isYouTubeNode(
  node: LexicalNode | null | undefined
): node is YouTubeNode {
  return node instanceof YouTubeNode
}

export const YOUTUBE_NODE_TRANSFORMER = createYouTubeTransformer(
  YouTubeNode,
  (videoID) => $createYouTubeNode(videoID)
)
