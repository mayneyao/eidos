import { useCallback } from "react"
import type { DataSpace } from "@eidos.space/core/data-space"
import { $generateNodesFromDOM } from "@lexical/html"
import type { Email } from "postal-mime"

import { createHeadlessEditor } from "@lexical/headless"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown"
import type { LexicalEditor } from "lexical"
import { $getRoot, $insertNodes, $nodesOfType } from "lexical"
import { zip } from "@/lib/lodash"

import { getAllLinks } from "@/lib/markdown"
import { getUuid } from "@/lib/utils"
import { getSqliteProxy } from "@/packages/core/sqlite/channel"
import { $getUrlMetaData } from "@/components/doc/blocks/bookmark/node"
import {
  allTransformers,
  markdownLinkInfoMap,
} from "@/components/doc/plugins/const"
import { CodeNode } from "@lexical/code"
import { $createMermaidNode } from "@/components/doc/blocks/mermaid/node"
import { getAllNodes } from "@/components/doc/nodes"

let editor: LexicalEditor

export const getHeadlessEditor = () => {
  if (!editor) {
    editor = createHeadlessEditor({
      nodes: getAllNodes(),
      onError: () => {},
    })
  }
  return editor
}

export const _lexical2markdown = async (
  articleEditorStateJSON: string
): Promise<string> => {
  const editor = getHeadlessEditor()
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
      // Convert base64 to Uint8Array
      const response = await fetch(url)
      const blob = await response.blob()
      const arrayBuffer = await blob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      // Generate file path
      const fileId = getUuid()
      const fileName = file.filename ?? `attachment-${fileId}`
      const ext = fileName.includes(".") ? fileName.split(".").pop() : ""
      const filePath = `~/.eidos/files/${fileId}${ext ? "." + ext : ""}`

      // Save file using fs
      await sqlite.fs.writeFile(filePath, uint8Array)

      // Update image src
      img.setAttribute("src", `/${filePath}`)
    }
  } catch (error) {
    console.warn(error)
  }
  return _convertHtml2State(dom.documentElement.outerHTML)
}

export const _convertHtml2State = async (html: string): Promise<string> => {
  return new Promise((resolve) => {
    const editor = createHeadlessEditor({
      nodes: getAllNodes(),
      onError: () => {},
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

export const _markdown2lexical = async (markdown: string): Promise<string> => {
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
      nodes: getAllNodes(),
      onError: () => {},
    })

    editor.update(
      () => {
        $convertFromMarkdownString(markdown, allTransformers, undefined, true)
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
    let newState = editor.getEditorState().toJSON()

    resolve(JSON.stringify(newState))
  })
}

export const useDocEditor = (sqlite: DataSpace | null) => {
  const lexical2markdown = useCallback(
    async (docId: string): Promise<string> => {
      const doc = await sqlite?.doc.get(docId)
      return _lexical2markdown(doc?.content ?? "")
    },
    [sqlite]
  )
  const markdown2lexical = _markdown2lexical
  return { lexical2markdown, markdown2lexical }
}
