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

export interface BookmarkPayload {
  description?: string
  fetched?: boolean
  image?: string
  title?: string
  url: string
}

export type SerializedBookmarkNode = Spread<
  {
    description?: string
    fetched?: boolean
    image?: string
    title?: string
    url: string
  },
  SerializedDecoratorBlockNode
>

export const markdownLinkInfoMap = new Map<string, BookmarkPayload>()

export class BaseBookmarkNode extends DecoratorBlockNode {
  public __url: string
  public __title?: string
  public __description?: string
  public __image?: string
  public __fetched?: boolean

  isKeyboardSelectable(): boolean {
    return true
  }

  static getType(): string {
    return "bookmark"
  }

  static clone(node: BaseBookmarkNode): BaseBookmarkNode {
    return new BaseBookmarkNode(
      node.__url,
      node.__title,
      node.__description,
      node.__image,
      node.__fetched,
      node.__format,
      node.__key
    )
  }

  static importJSON(serializedNode: SerializedBookmarkNode): BaseBookmarkNode {
    const node = new BaseBookmarkNode(
      serializedNode.url,
      serializedNode.title,
      serializedNode.description,
      serializedNode.image,
      serializedNode.fetched
    )
    node.setFormat(serializedNode.format)
    return node
  }

  exportJSON(): SerializedBookmarkNode {
    return {
      ...super.exportJSON(),
      description: this.__description,
      fetched: this.__fetched,
      image: this.__image,
      title: this.__title,
      type: "bookmark",
      url: this.__url,
      version: 1,
    }
  }

  constructor(
    url: string,
    title?: string,
    description?: string,
    image?: string,
    fetched?: boolean,
    format?: ElementFormatType,
    key?: NodeKey
  ) {
    super(format, key)
    this.__url = url
    this.__title = title
    this.__description = description
    this.__image = image
    this.__fetched = fetched
  }

  getUrl(): string {
    return this.__url
  }

  getFetched(): boolean {
    return Boolean(this.__fetched)
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): any {
    return null
  }
}

export function $isBaseBookmarkNode(
  node: LexicalNode | null | undefined
): node is BaseBookmarkNode {
  return node instanceof BaseBookmarkNode
}

export function createBookmarkTransformer<T extends typeof LexicalNode>(
  nodeClass: any = BaseBookmarkNode,
  createNode: (
    url: string,
    title?: string,
    description?: string,
    image?: string
  ) => InstanceType<T> = (url, title, description, image) => {
    return new nodeClass(url, title, description, image) as any
  }
): ElementTransformer {
  return {
    dependencies: [nodeClass],
    export: (node: LexicalNode) => {
      if (!(node instanceof nodeClass)) {
        return null
      }
      const bookmark = node as BaseBookmarkNode
      const dataAttributes = [
        `href="${bookmark.getUrl()}"`,
        `data-eidos-type="bookmark"`,
      ]
      if (bookmark.__title)
        dataAttributes.push(`data-title="${bookmark.__title}"`)
      if (bookmark.__description)
        dataAttributes.push(`data-description="${bookmark.__description}"`)
      if (bookmark.__image)
        dataAttributes.push(`data-image="${bookmark.__image}"`)

      return `<a ${dataAttributes.join(" ")}>${bookmark.getUrl()}</a>`
    },
    regExp:
      /<a href="([^"]+)" data-eidos-type="bookmark"(?: data-title="([^"]*)")?(?: data-description="([^"]*)")?(?: data-image="([^"]*)")?>.*?<\/a>\s?$/,
    replace: (textNode, _1, match) => {
      const [, url, title, description, image] = match
      const node = createNode(url, title, description, image)
      textNode.replace(node)
    },
    type: "element",
  }
}

export const BOOKMARK_NODE_TRANSFORMER = createBookmarkTransformer()
