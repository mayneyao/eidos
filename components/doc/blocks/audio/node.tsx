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

import { AudioComponent } from "./component"

export type SerializedAudioNode = Spread<
  {
    src: string
  },
  SerializedDecoratorBlockNode
>

export class AudioNode extends DecoratorBlockNode {
  __src: string

  static getType(): string {
    return "audio"
  }

  static clone(node: AudioNode): AudioNode {
    return new AudioNode(node.__src, node.__format, node.__key)
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

  static importJSON(data: SerializedAudioNode): AudioNode {
    const node = $createAudioNode(data.src)
    node.setFormat(data.format)
    return node
  }

  exportJSON(): SerializedAudioNode {
    return {
      ...super.exportJSON(),
      src: this.__src,
      type: "audio",
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
        <AudioComponent nodeKey={this.getKey()} url={this.__src} />
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
