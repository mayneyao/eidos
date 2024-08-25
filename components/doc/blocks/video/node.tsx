import { ReactNode } from "react"
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import {
  DecoratorNode,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical"

import { VideoComponent } from "./component"

export type SerializedVideoNode = Spread<
  {
    src: string
  },
  SerializedLexicalNode
>

export class VideoNode extends DecoratorNode<ReactNode> {
  __src: string

  static getType(): string {
    return "video"
  }

  static clone(node: VideoNode): VideoNode {
    return new VideoNode(node.__src, node.__key)
  }

  constructor(src: string, key?: NodeKey) {
    super(key)
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
    return node
  }

  exportJSON() {
    return {
      src: this.__src,
      type: "video",
      version: 1,
    }
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): ReactNode {
    const nodeKey = this.getKey()
    const embedBlockTheme = config.theme.embedBlock || {}
    const className = {
      base: embedBlockTheme.base || "",
      focus: embedBlockTheme.focus || "",
    }
    return (
      <BlockWithAlignableContents className={className} nodeKey={nodeKey}>
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
