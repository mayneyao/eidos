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

export type SerializedVideoNode = Spread<
  {
    src: string
  },
  SerializedDecoratorBlockNode
>

export class BaseVideoNode extends DecoratorBlockNode {
  public __src: string

  static getType(): string {
    return "video"
  }

  static clone(node: BaseVideoNode): BaseVideoNode {
    return new BaseVideoNode(node.__src, node.__format, node.__key)
  }

  constructor(src: string, format?: ElementFormatType, key?: NodeKey) {
    super(format, key)
    this.__src = src
  }

  static importJSON(serializedNode: SerializedVideoNode): BaseVideoNode {
    const node = new BaseVideoNode(serializedNode.src)
    node.setFormat(serializedNode.format)
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

export function $isBaseVideoNode(
  node: LexicalNode | null | undefined
): node is BaseVideoNode {
  return node instanceof BaseVideoNode
}

export function createVideoTransformer<T extends typeof LexicalNode>(
  nodeClass: any = BaseVideoNode,
  createNode: (src: string) => InstanceType<T> = (src) =>
    new nodeClass(src) as any
): ElementTransformer {
  return {
    dependencies: [nodeClass],
    export: (node) => {
      if (!(node instanceof nodeClass)) {
        return null
      }
      return `<video src="${(node as BaseVideoNode).getSrc()}" />`
    },
    regExp: /<video src="([^"]+?)"\s?\/>\s?$/,
    replace: (textNode, _1, match) => {
      const [, src] = match
      const videoNode = createNode(src)
      textNode.replace(videoNode)
    },
    type: "element",
  }
}

export const VIDEO_NODE_TRANSFORMER = createVideoTransformer()
