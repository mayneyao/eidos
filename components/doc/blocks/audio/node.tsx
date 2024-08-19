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

import { AudioComponent } from "./component"

export type SerializedAudioNode = Spread<
  {
    src: string
  },
  SerializedLexicalNode
>

export class AudioNode extends DecoratorNode<ReactNode> {
  __src: string

  static getType(): string {
    return "audio"
  }

  static clone(node: AudioNode): AudioNode {
    return new AudioNode(node.__src, node.__key)
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

  static importJSON(data: SerializedAudioNode): AudioNode {
    const node = $createAudioNode(data.src)
    return node
  }

  exportJSON() {
    return {
      src: this.__src,
      type: "audio",
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
        <AudioComponent url={this.__src} nodeKey={this.__key} />
      </BlockWithAlignableContents>
    )
  }

  getTextContent(): string {
    return this.__src
  }
}

export function $createAudioNode(src: string): AudioNode {
  return new AudioNode(src)
}

export function $isAudioNode(
  node: LexicalNode | null | undefined
): node is AudioNode {
  return node instanceof AudioNode
}
