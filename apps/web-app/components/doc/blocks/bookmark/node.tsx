import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import {
  BaseBookmarkNode,
  $isBaseBookmarkNode,
  markdownLinkInfoMap,
  createBookmarkTransformer,
  type BookmarkPayload,
  type SerializedBookmarkNode,
} from "@eidos.space/lexical"

export { type BookmarkPayload, type SerializedBookmarkNode }
import {
  $applyNodeReplacement,
  type EditorConfig,
  type ElementFormatType,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical"

import { BookmarkComponent } from "./component"

export class BookmarkNode extends BaseBookmarkNode {
  static getType(): string {
    return "bookmark"
  }

  static clone(node: BookmarkNode): BookmarkNode {
    return new BookmarkNode(
      {
        url: node.__url,
        title: node.__title,
        description: node.__description,
        image: node.__image,
        fetched: node.__fetched,
      },
      node.getFormat(),
      node.getKey()
    )
  }

  constructor(
    payload: BookmarkPayload,
    format?: ElementFormatType,
    key?: NodeKey
  ) {
    super(
      payload.url,
      payload.title,
      payload.description,
      payload.image,
      payload.fetched,
      format,
      key
    )
  }

  static importJSON(data: SerializedBookmarkNode): BookmarkNode {
    const node = $createBookmarkNode(data)
    node.setFormat(data.format)
    return node
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    const data = this.exportJSON()
    const nodeKey = this.getKey()
    const embedBlockTheme = config.theme.embedBlock || {}

    const className = {
      base: embedBlockTheme.base || "",
      focus: embedBlockTheme.focus || "",
    }
    return (
      <BlockWithAlignableContents
        format={this.getFormat()}
        className={className}
        nodeKey={nodeKey}
      >
        <BookmarkComponent {...data} nodeKey={nodeKey} />
      </BlockWithAlignableContents>
    )
  }

  setAll(payload: BookmarkPayload) {
    const writable = this.getWritable()
    writable.__url = payload.url
    writable.__title = payload.title
    writable.__description = payload.description
    writable.__image = payload.image
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
    return { url, title: url } as BookmarkPayload
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
    return { url, title: url } as BookmarkPayload
  } finally {
    clearTimeout(timeout)
  }
}

export const BOOKMARK_NODE_TRANSFORMER = createBookmarkTransformer(
  BookmarkNode,
  (url) => {
    const payload = markdownLinkInfoMap.get(url) || { url }
    return $createBookmarkNode(payload as any)
  }
)
