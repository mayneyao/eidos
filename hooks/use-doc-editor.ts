import { useCallback } from "react"
import type { DataSpace } from "@/worker/DataSpace"

import "@/lib/prism-config"
// lexical code highlight depends on prismjs which run in worker prism-config disable messageHandler otherwise it will throw error
import { CodeHighlightNode, CodeNode } from "@lexical/code"
import { HashtagNode } from "@lexical/hashtag"
import { createHeadlessEditor } from "@lexical/headless"
import { AutoLinkNode, LinkNode } from "@lexical/link"
import { ListItemNode, ListNode } from "@lexical/list"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  CHECK_LIST,
  CODE,
  INLINE_CODE,
  TRANSFORMERS,
} from "@lexical/markdown"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table"

import { DatabaseTableNode } from "@/components/doc/nodes/DatabaseTableNode"
import { IMAGE, ImageNode } from "@/components/doc/nodes/ImageNode"
import { MentionNode } from "@/components/doc/nodes/MentionNode"
import { SQLNode, SQL_NODE_TRANSFORMER } from "@/components/doc/nodes/SQL"

const CUSTOM_TRANSFORMERS = [IMAGE, SQL_NODE_TRANSFORMER]
export const allTransformers = [
  CHECK_LIST,
  CODE,
  INLINE_CODE,
  ...TRANSFORMERS,
  ...CUSTOM_TRANSFORMERS,
]

export const AllEditorNodes = [
  HeadingNode,
  ListNode,
  ListItemNode,
  QuoteNode,
  CodeNode,
  CodeHighlightNode,
  TableNode,
  TableCellNode,
  TableRowNode,
  AutoLinkNode,
  LinkNode,
  ImageNode,
  SQLNode,
  HashtagNode,
  MentionNode,
  DatabaseTableNode,
]

export const _getDocMarkdown = async (
  articleEditorStateJSON: string
): Promise<string> => {
  const editor = createHeadlessEditor({
    nodes: AllEditorNodes,
    onError: () => {},
  })
  try {
    const state = editor.parseEditorState(articleEditorStateJSON)
    if (state.isEmpty()) {
      return ""
    }
    editor.setEditorState(state)
    return new Promise((resolve) => {
      editor.update(() => {
        const markdown = $convertToMarkdownString(allTransformers)
        resolve(markdown)
      })
    })
  } catch (error) {
    console.warn(`parse doc error`, error)
    return ""
  }
}

export const _convertMarkdown2State = async (
  markdown: string
): Promise<string> => {
  return new Promise((resolve) => {
    const editor = createHeadlessEditor({
      nodes: AllEditorNodes,
      onError: () => {},
    })
    editor.update(
      () => {
        $convertFromMarkdownString(markdown, allTransformers)
      },
      {
        discrete: true,
      }
    )
    const json = editor.getEditorState().toJSON()
    const content = JSON.stringify(json)
    resolve(content)
  })
}

export const useDocEditor = (sqlite: DataSpace | null) => {
  const getDocMarkdown = useCallback(
    async (docId: string): Promise<string> => {
      const doc = await sqlite?.doc.get(docId)
      return _getDocMarkdown(doc?.content)
    },
    [sqlite]
  )
  const convertMarkdown2State = _convertMarkdown2State
  return { getDocMarkdown, convertMarkdown2State }
}
