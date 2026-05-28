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

export type SerializedAudioNode = Spread<
  {
    src: string
  },
  SerializedDecoratorBlockNode
>

export class BaseAudioNode extends DecoratorBlockNode {
  public __src: string

  static getType(): string {
    return "audio"
  }

  static clone(node: BaseAudioNode): BaseAudioNode {
    return new BaseAudioNode(node.__src, node.__format, node.__key)
  }

  constructor(src: string, format?: ElementFormatType, key?: NodeKey) {
    super(format, key)
    this.__src = src
  }

  static importJSON(serializedNode: SerializedAudioNode): BaseAudioNode {
    const node = new BaseAudioNode(serializedNode.src)
    node.setFormat(serializedNode.format)
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

  getSrc(): string {
    return this.__src
  }

  setSrc(src: string): void {
    const writable = this.getWritable()
    writable.__src = src
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): any {
    return null
  }
}

export function $isBaseAudioNode(
  node: LexicalNode | null | undefined
): node is BaseAudioNode {
  return node instanceof BaseAudioNode
}

export function createAudioTransformer<T extends typeof LexicalNode>(
  nodeClass: any = BaseAudioNode,
  createNode: (src: string) => InstanceType<T> = (src) =>
    new nodeClass(src) as any
): ElementTransformer {
  return {
    dependencies: [nodeClass],
    export: (node) => {
      if (!(node instanceof nodeClass)) {
        return null
      }
      return `<audio src="${(node as BaseAudioNode).getSrc()}" />`
    },
    regExp: /<audio src="([^"]+?)"\s?\/>\s?$/,
    replace: (textNode, _1, match) => {
      const [, src] = match
      const audioNode = createNode(src)
      textNode.replace(audioNode)
    },
    type: "element",
  }
}

export const AUDIO_NODE_TRANSFORMER = createAudioTransformer()
