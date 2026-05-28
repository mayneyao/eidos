import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import {
  BaseAudioNode,
  $isBaseAudioNode,
  createAudioTransformer,
  type SerializedAudioNode,
} from "@eidos.space/lexical"
import type {
  EditorConfig,
  ElementFormatType,
  LexicalEditor,
  LexicalNode,
  NodeKey,
} from "lexical"

import { AudioComponent } from "./component"

export class AudioNode extends BaseAudioNode {
  static getType(): string {
    return "audio"
  }

  static clone(node: AudioNode): AudioNode {
    return new AudioNode(node.__src, node.getFormat(), node.getKey())
  }

  constructor(src: string, format?: ElementFormatType, key?: NodeKey) {
    super(src, format, key)
  }

  static importJSON(data: SerializedAudioNode): AudioNode {
    const node = $createAudioNode(data.src)
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
        nodeKey={this.getFormat()}
      >
        <AudioComponent url={this.__src} nodeKey={this.getKey()} />
      </BlockWithAlignableContents>
    )
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

export const AUDIO_NODE_TRANSFORMER = createAudioTransformer(AudioNode, (src) =>
  $createAudioNode(src)
)
