import { createHeadlessEditor } from "@lexical/headless"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  type Transformer,
} from "@lexical/markdown"
import type { SerializedEditorState } from "lexical"
import { $getRoot, $insertNodes, type Klass, type LexicalNode } from "lexical"
import { getStandardNodes } from "./standard-nodes"
import { getEidosNodes, getEidosTransformers } from "./nodes/index"
import { getStandardTransformers } from "./transformers"

const NODES = [...getEidosNodes(), ...getStandardNodes()]
const TRANSFORMERS = [...getEidosTransformers(), ...getStandardTransformers()]

export async function markdown2lexical(
  markdown: string,
  extraNodes: Array<Klass<LexicalNode>> = [],
  extraTransformers: Transformer[] = []
): Promise<string> {
  const editor = createHeadlessEditor({
    nodes: [...NODES, ...extraNodes],
    onError: (error) => {
      console.error(error)
    },
  })

  try {
    editor.update(
      () => {
        $getRoot().select()
        $convertFromMarkdownString(
          markdown,
          [...TRANSFORMERS, ...extraTransformers],
          undefined,
          true
        )
      },
      {
        discrete: true,
      }
    )
  } catch (error) {
    console.error("Markdown to Lexical conversion failed", error)
  }

  const newState = editor.getEditorState().toJSON() as SerializedEditorState
  return JSON.stringify(newState)
}

export async function lexical2markdown(
  stateJSON: string,
  extraNodes: Array<Klass<LexicalNode>> = [],
  extraTransformers: Transformer[] = []
): Promise<string> {
  const editor = createHeadlessEditor({
    nodes: [...NODES, ...extraNodes],
    onError: (error) => {
      console.error(error)
    },
  })

  try {
    const state = editor.parseEditorState(stateJSON)
    if (state.isEmpty()) {
      return ""
    }
    editor.setEditorState(state)

    let markdown = ""
    editor.update(
      () => {
        markdown = $convertToMarkdownString([
          ...TRANSFORMERS,
          ...extraTransformers,
        ])
      },
      {
        discrete: true,
      }
    )
    return markdown
  } catch (error) {
    console.warn("Parse doc error in headless", error)
    return ""
  }
}

// TODO: Implement convertHtml2State if needed using jsdom in Node.js
export async function convertHtml2State(
  html: string,
  extraNodes: Array<Klass<LexicalNode>> = [],
  extraTransformers: Transformer[] = []
): Promise<string> {
  // Fallback for now or use DOMParser if available (Web Worker)
  if (typeof DOMParser !== "undefined") {
    const editor = createHeadlessEditor({
      nodes: [...NODES, ...extraNodes],
      onError: (error) => {
        console.error(error)
      },
    })
    const { $generateNodesFromDOM } = await import("@lexical/html")
    const { $getRoot, $insertNodes } = await import("lexical")

    let state = ""
    editor.update(
      () => {
        const parser = new DOMParser()
        const dom = parser.parseFromString(html, "text/html")
        const nodes = $generateNodesFromDOM(editor, dom)
        $getRoot().select()
        $insertNodes(nodes)
        state = JSON.stringify(editor.getEditorState().toJSON())
      },
      {
        discrete: true,
      }
    )
    return state
  }
  console.warn("convertHtml2State: DOMParser not available in this environment")
  return ""
}
