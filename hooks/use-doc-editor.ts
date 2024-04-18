import type { DataSpace } from "@/worker/web-worker/DataSpace"
import { useCallback } from "react"

import "@/lib/prism-config"
// lexical code highlight depends on prismjs which run in worker prism-config disable messageHandler otherwise it will throw error
import { createHeadlessEditor } from "@lexical/headless"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown"
import zip from "lodash/zip"

import { AllNodes } from "@/components/doc/nodes"
import {
  $getUrlMetaData
} from "@/components/doc/nodes/BookmarkNode"
import {
  allTransformers,
  markdownLinkInfoMap,
} from "@/components/doc/plugins/const"
import { getAllLinks } from "@/lib/markdown"

export const _getDocMarkdown = async (
  articleEditorStateJSON: string
): Promise<string> => {
  const editor = createHeadlessEditor({
    nodes: AllNodes,
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
  // parse all links from markdown, then get preview data of all links
  const allLinks = getAllLinks(markdown)
  const infos = await Promise.all(
    allLinks.map(async (link) => {
      return $getUrlMetaData(link)
    })
  )
  zip(infos, allLinks).forEach(([info, link]) => {
    markdownLinkInfoMap.set(link!, info!)
  })
  return new Promise((resolve) => {
    const editor = createHeadlessEditor({
      nodes: AllNodes,
      onError: () => {},
    })

    editor.update(
      () => {
        $convertFromMarkdownString(markdown, allTransformers)
        markdownLinkInfoMap.clear()
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
