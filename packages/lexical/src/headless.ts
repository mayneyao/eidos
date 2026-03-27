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
import { assignIdsViaHarness, type HarnessOptions } from "./utils/id-harness"

const NODES = [...getEidosNodes(), ...getStandardNodes()]
const TRANSFORMERS = [...getEidosTransformers(), ...getStandardTransformers()]

/**
 * Markdown conversion options
 */
export interface MarkdownConversionOptions extends HarnessOptions {
  /** Old state JSON string (for ID preservation) */
  oldState?: string
  /** Whether to enable ID Harness (default true) */
  useHarness?: boolean
}

export async function markdown2lexical(
  markdown: string,
  extraNodes: Array<Klass<LexicalNode>> = [],
  extraTransformers: Transformer[] = [],
  options: MarkdownConversionOptions = {}
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

  let newState = editor.getEditorState().toJSON() as SerializedEditorState

  // Apply ID Harness: preserve old state IDs as much as possible
  if (options.useHarness !== false) {
    const oldState = options.oldState
      ? (JSON.parse(options.oldState) as SerializedEditorState)
      : null

    newState = assignIdsViaHarness(newState, oldState, {
      hashLength: options.hashLength ?? 6,
      fuzzyMatch: options.fuzzyMatch ?? true,
      fuzzyThreshold: options.fuzzyThreshold ?? 0.3,
    })
  }

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
