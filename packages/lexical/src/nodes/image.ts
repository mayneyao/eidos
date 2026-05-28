import type { TextMatchTransformer } from "@lexical/markdown"
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

export interface ImagePayload {
  altText?: string
  height?: number
  maxWidth?: number
  src: string
  width?: number
  showCaption?: boolean
  captionsEnabled?: boolean
}

export type SerializedImageNode = Spread<
  {
    altText?: string
    height?: number
    maxWidth?: number
    src: string
    width?: number
    showCaption?: boolean
    captionsEnabled?: boolean
  },
  SerializedDecoratorBlockNode
>

export class BaseImageNode extends DecoratorBlockNode {
  public __src: string
  public __altText: string
  public __width?: number
  public __height?: number
  public __maxWidth: number
  public __showCaption?: boolean
  public __captionsEnabled?: boolean

  static getType(): string {
    return "image"
  }

  static clone(node: BaseImageNode): BaseImageNode {
    return new BaseImageNode(
      node.__src,
      node.__altText,
      node.__maxWidth,
      node.__width,
      node.__height,
      node.__showCaption,
      node.__captionsEnabled,
      node.__format,
      node.__key
    )
  }

  static importJSON(serializedNode: SerializedImageNode): BaseImageNode {
    const {
      altText,
      height,
      width,
      maxWidth,
      showCaption,
      src,
      captionsEnabled,
    } = serializedNode
    const node = new BaseImageNode(
      src,
      altText || "",
      maxWidth || 500,
      width,
      height,
      showCaption,
      captionsEnabled
    )
    node.setFormat(serializedNode.format)
    return node
  }

  exportJSON(): SerializedImageNode {
    return {
      ...super.exportJSON(),
      altText: this.__altText,
      height: this.__height,
      maxWidth: this.__maxWidth,
      src: this.__src,
      type: "image",
      version: 1,
      width: this.__width,
      showCaption: this.__showCaption,
      captionsEnabled: this.__captionsEnabled,
    }
  }

  constructor(
    src: string,
    altText: string,
    maxWidth: number,
    width?: number,
    height?: number,
    showCaption?: boolean,
    captionsEnabled?: boolean,
    format?: ElementFormatType,
    key?: NodeKey
  ) {
    super(format, key)
    this.__src = src
    this.__altText = altText
    this.__maxWidth = maxWidth
    this.__width = width
    this.__height = height
    this.__showCaption = showCaption
    this.__captionsEnabled = captionsEnabled
  }

  getSrc(): string {
    return this.__src
  }

  getAltText(): string {
    return this.__altText || ""
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): any {
    return null
  }
}

export function $isBaseImageNode(
  node: LexicalNode | null | undefined
): node is BaseImageNode {
  return node instanceof BaseImageNode
}

export function createImageTransformer<T extends typeof LexicalNode>(
  nodeClass: any = BaseImageNode,
  createNode: (src: string, altText: string) => InstanceType<T> = (
    src,
    altText
  ) => new nodeClass(src, altText, 500) as any
): TextMatchTransformer {
  return {
    dependencies: [nodeClass],
    export: (node: LexicalNode) => {
      if (!(node instanceof nodeClass)) {
        return null
      }
      return `![${(node as BaseImageNode).getAltText()}](${(node as BaseImageNode).getSrc()})`
    },
    importRegExp: /!\[([^\[]*)]\(([^\s].*?)\)/,
    regExp: /!\[([^\[]*)]\(([^\s].*?)\)$/,
    replace: (textNode, match) => {
      const [, altText, src] = match
      const node = createNode(src, altText)
      textNode.replace(node)
    },
    trigger: ")",
    type: "text-match",
  }
}

export const IMAGE_NODE_TRANSFORMER = createImageTransformer()
