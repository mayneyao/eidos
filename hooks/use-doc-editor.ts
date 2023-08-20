import { useCallback } from "react"
import { DataSpace } from "@/worker/DataSpace"
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
  editor.setEditorState(editor.parseEditorState(articleEditorStateJSON))
  return new Promise((resolve) => {
    editor.update(() => {
      const markdown = $convertToMarkdownString(allTransformers)
      resolve(markdown)
    })
  })
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
