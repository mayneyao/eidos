import { useCallback } from "react"
import type { DataSpace } from "@/worker/web-worker/DataSpace"
import { $generateNodesFromDOM } from "@lexical/html"
import type { Email } from "postal-mime"

import "@/lib/prism-config"
// lexical code highlight depends on prismjs which run in worker prism-config disable messageHandler otherwise it will throw error
import { createHeadlessEditor } from "@lexical/headless"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown"
import { $getRoot, $insertNodes, $nodesOfType } from "lexical"
import zip from "lodash/zip"

import { getAllLinks } from "@/lib/markdown"
import { getSqliteProxy } from "@/lib/sqlite/channel"
import { efsManager } from "@/lib/storage/eidos-file-system"
import { AllNodes } from "@/components/doc/nodes"
import { $getUrlMetaData } from "@/components/doc/nodes/BookmarkNode"
import {
  allTransformers,
  markdownLinkInfoMap,
} from "@/components/doc/plugins/const"
import { CodeNode } from "@lexical/code"
import { $createMermaidNode } from "@/components/doc/blocks/mermaid/node"

export const _getDocMarkdown = async (
  articleEditorStateJSON: string
): Promise<string> => {
  const editor = createHeadlessEditor({
    nodes: AllNodes,
    onError: () => { },
  })
  try {
    const state = editor.parseEditorState(articleEditorStateJSON)
    if (state.isEmpty()) {
      return ""
    }
    editor.setEditorState(state)
    return new Promise((resolve) => {
      editor.update(
        () => {
          const markdown = $convertToMarkdownString(allTransformers)
          resolve(markdown)
        },
        {
          discrete: true,
        }
      )
    })
  } catch (error) {
    console.warn(`parse doc error`, error)
    return ""
  }
}

export const _convertEmail2State = async (
  email: Email,
  space: string,
  userId?: string
): Promise<string> => {
  if (!email.html) return ""
  const sqlite = getSqliteProxy(space, userId ?? "")
  const parser = new DOMParser()
  const dom = parser.parseFromString(email.html, "text/html")
  // get all images in email, find attachment and replace with cid
  const images = dom.querySelectorAll("img")
  try {
    for (const img of images) {
      const src = img.getAttribute("src")
      const cid = src?.replace("cid:", "")
      const file = email.attachments.find(
        (attachment) => attachment.contentId === `<${cid}>`
      )
      if (!file) continue
      // file.content is base64 encoded
      const url = `data:${file.mimeType};base64,${file.content}`
      const savedFile = await sqlite.saveFile2EFS(
        url,
        ["images"],
        file.filename ?? undefined
      )
      savedFile?.path &&
        img.setAttribute("src", efsManager.getFileUrlByPath(savedFile?.path))
    }
  } catch (error) {
    console.warn(error)
  }
  return _convertHtml2State(dom.documentElement.outerHTML)
}

export const _convertHtml2State = async (html: string): Promise<string> => {
  return new Promise((resolve) => {
    const editor = createHeadlessEditor({
      nodes: AllNodes,
      onError: () => { },
    })

    editor.update(
      () => {
        // In the browser you can use the native DOMParser API to parse the HTML string.
        const parser = new DOMParser()
        const dom = parser.parseFromString(html, "text/html")

        // Once you have the DOM instance it's easy to generate LexicalNodes.
        const nodes = $generateNodesFromDOM(editor, dom)
        // Select the root
        $getRoot().select()
        // Insert them at a selection.
        $insertNodes(nodes)
      },
      {
        discrete: true,
      }
    )
    const json = editor.getEditorState().toJSON()
    console.log("json", json)
    const content = JSON.stringify(json)
    resolve(content)
  })
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
      onError: () => { },
    })

    editor.update(
      () => {
        $convertFromMarkdownString(markdown, allTransformers)
        markdownLinkInfoMap.clear()
        // after calling $convertFromMarkdownString()
        for (const code of $nodesOfType(CodeNode)) {
          const lang = code.getLanguage()
          if (lang === "mermaid") {
            code.replace($createMermaidNode(code.getTextContent()))
          }
        }
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
      return _getDocMarkdown(doc?.content ?? "")
    },
    [sqlite]
  )
  const convertMarkdown2State = _convertMarkdown2State
  return { getDocMarkdown, convertMarkdown2State }
}
