import { useCallback } from "react"
import type { DataSpace } from "@/worker/DataSpace"

import "@/lib/prism-config"
// lexical code highlight depends on prismjs which run in worker prism-config disable messageHandler otherwise it will throw error
import { CodeHighlightNode, CodeNode } from "@lexical/code"
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

export const allTransformers = [CHECK_LIST, CODE, INLINE_CODE, ...TRANSFORMERS]

export const AllNodes = [
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
  //   SQLNode,
]
const editor = createHeadlessEditor({
  nodes: AllNodes,
  onError: () => {},
})

export const _getDocMarkdown = async (
  sqlite: DataSpace | null,
  docId: string
): Promise<string> => {
  if (!sqlite) return ""
  const articleEditorStateJSON = await sqlite.getDoc(docId)
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
    console.warn(`parse doc ${docId} error`, error)
    return ""
  }
}

export const _convertMarkdown2State = async (
  markdown: string
): Promise<string> => {
  return new Promise((resolve) => {
    editor.update(() => {
      $convertFromMarkdownString(markdown, allTransformers)
      const json = editor.getEditorState().toJSON()
      const content = JSON.stringify(json)
      resolve(content)
    })
  })
}

export const useDocEditor = (sqlite: DataSpace | null) => {
  const getDocMarkdown = useCallback(
    async (docId: string): Promise<string> => {
      return _getDocMarkdown(sqlite, docId)
    },
    [sqlite]
  )
  const convertMarkdown2State = _convertMarkdown2State
  return { getDocMarkdown, convertMarkdown2State }
}
