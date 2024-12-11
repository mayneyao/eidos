import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import {
  DecoratorBlockNode,
  SerializedDecoratorBlockNode,
} from "@lexical/react/LexicalDecoratorBlockNode"
import {
  EditorConfig,
  ElementFormatType,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  Spread,
} from "lexical"

import { VideoComponent } from "./component"

export type SerializedVideoNode = Spread<
  {
    src: string
  },
  SerializedDecoratorBlockNode
>

export class VideoNode extends DecoratorBlockNode {
  __src: string

  static getType(): string {
    return "video"
  }

  static clone(node: VideoNode): VideoNode {
    return new VideoNode(node.__src, node.__format, node.__key)
  }

  constructor(src: string, format?: ElementFormatType, key?: NodeKey) {
    super(format, key)
    this.__src = src
  }

  setSrc(src: string): void {
    const writable = this.getWritable()
    writable.__src = src
  }

  createDOM(): HTMLElement {
    return document.createElement("div")
  }

  updateDOM(): false {
    return false
  }

  static importJSON(data: SerializedVideoNode): VideoNode {
    const node = $createVideoNode(data.src)
    node.setFormat(data.format)
    return node
  }

  exportJSON(): SerializedVideoNode {
    return {
      ...super.exportJSON(),
      src: this.__src,
      type: "video",
      version: 1,
    }
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    const embedBlockTheme = config.theme.embedBlock || {}
    const className = {
      base: embedBlockTheme.base || "",
      focus: embedBlockTheme.focus || "",
    }
    return (
      <BlockWithAlignableContents
        format={this.__format}
        className={className}
        nodeKey={this.__key}
      >
        <VideoComponent url={this.__src} nodeKey={this.__key} />
      </BlockWithAlignableContents>
    )
  }

  getTextContent(): string {
    return this.__src
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
