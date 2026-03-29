import type { ElementTransformer } from "@lexical/markdown"
import type { SerializedDecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode"
import { DecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode"
import {
  type EditorConfig,
  type ElementFormatType,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type Spread,
} from "lexical"

export type SerializedYouTubeNode = Spread<
  {
    videoID: string
  },
  SerializedDecoratorBlockNode
>

export class BaseYouTubeNode extends DecoratorBlockNode {
  __id: string

  static getType(): string {
    return "youtube"
  }

  static clone(node: BaseYouTubeNode): BaseYouTubeNode {
    return new BaseYouTubeNode(node.__id, node.__format, node.__key)
  }

  static importJSON(serializedNode: SerializedYouTubeNode): BaseYouTubeNode {
    const node = new BaseYouTubeNode(serializedNode.videoID)
    node.setFormat(serializedNode.format)
    return node
  }

  exportJSON(): SerializedYouTubeNode {
    return {
      ...super.exportJSON(),
      type: "youtube",
      version: 1,
      videoID: this.__id,
    }
  }

  constructor(id: string, format?: ElementFormatType, key?: NodeKey) {
    super(format, key)
    this.__id = id
  }

  getId(): string {
    return this.__id
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): any {
    return null
  }
}

export function $isBaseYouTubeNode(
  node: LexicalNode | null | undefined
): node is BaseYouTubeNode {
  return node instanceof BaseYouTubeNode
}

export function createYouTubeTransformer<T extends typeof LexicalNode>(
  nodeClass: any = BaseYouTubeNode,
  createNode: (videoID: string) => InstanceType<T> = (videoID) =>
    new nodeClass(videoID) as any
): ElementTransformer {
  return {
    dependencies: [nodeClass],
    export: (node: LexicalNode) => {
      if (!(node instanceof nodeClass)) {
        return null
      }
      return `https://www.youtube.com/watch?v=${(node as BaseYouTubeNode).getId()}`
    },
    regExp:
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})$/,
    replace: (parentNode, _1, match, isImport) => {
      const [, videoID] = match
      const youtubeNode = createNode(videoID)
      if (isImport || parentNode.getNextSibling() != null) {
        parentNode.replace(youtubeNode)
      } else {
        parentNode.insertBefore(youtubeNode)
      }
      youtubeNode.selectNext()
    },
    type: "element",
  }
}

export const YOUTUBE_NODE_TRANSFORMER = createYouTubeTransformer()
