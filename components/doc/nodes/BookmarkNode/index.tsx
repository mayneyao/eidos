import { ReactNode } from "react"
import { $isAutoLinkNode, $isLinkNode } from "@lexical/link"
import { TextMatchTransformer } from "@lexical/markdown"
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import { DecoratorNode, EditorConfig, LexicalEditor } from "lexical"
import { LexicalNode, NodeKey } from "lexical/LexicalNode"

import { markdownLinkInfoMap } from "../../plugins/const"
import { BookmarkComponent } from "./BookmarkComponent"

export interface BookmarkPayload {
  url: string
  title?: string
  description?: string
  image?: string
  key?: NodeKey
}

export class BookmarkNode extends DecoratorNode<ReactNode> {
  __url: string
  __title?: string
  __description?: string
  __image?: string

  static getType(): string {
    return "bookmark"
  }

  static clone(node: BookmarkNode): BookmarkNode {
    return new BookmarkNode(node.exportJSON())
  }

  constructor(payload: BookmarkPayload) {
    const { url, title, description, image, key } = payload
    super(key)
    this.__url = url
    this.__title = title
    this.__description = description
    this.__image = image
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
      url: this.__url,
      title: this.__title,
      description: this.__description,
      image: this.__image,
      type: "bookmark",
      version: 1,
    }
  }
}

export function $createBookmarkNode(payload: BookmarkPayload): BookmarkNode {
  return new BookmarkNode(payload)
}

export function $isBookmarkNode(
  node: LexicalNode | null | undefined
): node is BookmarkNode {
  return node instanceof BookmarkNode
}

export async function $getUrlMetaData(
  url: string
): Promise<BookmarkPayload & { error?: string }> {
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
    if ($isBookmarkNode(node)) {
      return `[${node.getUrl()}](${node.getUrl()})`
    }
    return null
  },
  importRegExp: /(?<!\!)\[([^\]]*)\]\(([^)]*)\)/,
  regExp: /(?<!\!)\[([^\]]*)\]\(([^)]*)\)$/,
  replace: (textNode, match) => {
    const [, altText, src] = match
    const data = markdownLinkInfoMap.get(src) || {
      url: src,
    }
    const bookmarkNode = $createBookmarkNode(data)
    textNode.replace(bookmarkNode)
  },
  trigger: ")",
  type: "text-match",
}
