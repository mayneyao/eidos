import { ReactNode } from "react"
import { TextMatchTransformer } from "@lexical/markdown"
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import {
  $applyNodeReplacement,
  DecoratorNode,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
} from "lexical"

import { markdownLinkInfoMap } from "../../plugins/const"
import { BookmarkComponent } from "./BookmarkComponent"

export interface BookmarkPayload {
  url: string
  title?: string
  description?: string
  image?: string
  fetched?: boolean
  key?: NodeKey
}

export class BookmarkNode extends DecoratorNode<ReactNode> {
  __url: string
  __title?: string
  __description?: string
  __image?: string
  __fetched?: boolean

  isKeyboardSelectable(): boolean {
    return true
  }
  static getType(): string {
    return "bookmark"
  }

  static clone(node: BookmarkNode): BookmarkNode {
    return new BookmarkNode(node.exportJSON())
  }

  getTextContent(): string {
    return `[${this.getUrl()}](${this.getUrl()})`
  }

  constructor(payload: BookmarkPayload) {
    const { url, title, description, image, key } = payload
    super(key)
    this.__url = url
    this.__title = title
    this.__description = description
    this.__image = image
    this.__fetched = false
  }

  getFetched(): boolean {
    return Boolean(this.__fetched)
  }

  getUrl(): string {
    return this.__url
  }
  createDOM(): HTMLElement {
    const node = document.createElement("div")
    node.style.position = "relative"
    return node
  }

  updateDOM(): false {
    return false
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): ReactNode {
    const data = this.exportJSON()
    const nodeKey = this.getKey()
    const embedBlockTheme = config.theme.embedBlock || {}

    const className = {
      base: embedBlockTheme.base || "",
      focus: embedBlockTheme.focus || "",
    }
    return (
      <BlockWithAlignableContents className={className} nodeKey={nodeKey}>
        <BookmarkComponent {...data} nodeKey={nodeKey} />
      </BlockWithAlignableContents>
    )
  }

  static importJSON(data: any): BookmarkNode {
    const node = $createBookmarkNode(data)
    return node
  }

  setAll(payload: BookmarkPayload) {
    const writable = this.getWritable()

    writable.__url = payload.url
    writable.__title = payload.title
    writable.__description = payload.description
    writable.__image = payload.image
  }

  exportJSON() {
    return {
      key: this.getKey(),
      url: this.__url,
      title: this.__title,
      description: this.__description,
      image: this.__image,
      fetched: this.__fetched,
      type: "bookmark",
      version: 1,
    }
  }
}

export function $createBookmarkNode(payload: BookmarkPayload): BookmarkNode {
  return $applyNodeReplacement(new BookmarkNode(payload))
}

export function $isBookmarkNode(
  node: LexicalNode | null | undefined
): node is BookmarkNode {
  return node instanceof BookmarkNode
}

export async function $getUrlMetaData(
  url: string
): Promise<BookmarkPayload & { error?: string }> {
  if (!url) {
    return { url, title: url }
  }
  // timeout 3s for fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, 3000)
  try {
    const data = await fetch(`https://link-preview.eidos.space/?q=${url}`, {
      signal: controller.signal,
    })
    const json = await data.json()
    return json
  } catch (e) {
    return { url, title: url }
  } finally {
    clearTimeout(timeout)
  }
}

export const BOOKMARK: TextMatchTransformer = {
  dependencies: [BookmarkNode],
  export: (node) => {
    // not working as expected
    // DecoratorNode will be exported via getTextContent method
    // see:https://github.com/facebook/lexical/blob/main/packages/lexical-markdown/src/MarkdownExport.ts#L78
    if (!$isBookmarkNode(node)) {
      return null
    }
    return `[${node.getUrl()}](${node.getUrl()})`
  },
  importRegExp: /^(?<!\!)\[([^\]]*)\]\(([^)]*)\)$/,
  regExp: /(?<!\!)\[([^\]]*)\]\(([^)]*)\)$/,
  replace: (textNode, match) => {
    const [, altText, src] = match
    try {
      new URL(src)
      const data = markdownLinkInfoMap.get(src) || {
        url: src,
      }
      console.log("data", data)
      const bookmarkNode = $createBookmarkNode(data)
      textNode.replace(bookmarkNode)
    } catch (error) {}
  },
  trigger: ")",
  type: "text-match",
}
