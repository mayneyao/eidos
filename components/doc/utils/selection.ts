import { createHeadlessEditor } from "@lexical/headless"
import { $convertToMarkdownString } from "@lexical/markdown"
import { $getRoot, BaseSelection, RootNode } from "lexical"

import { _getDocMarkdown } from "@/hooks/use-doc-editor"

import { getAllNodes } from "../nodes"
import { allTransformers } from "../plugins/const"

/**
 * 
 * @param selection 
 * @returns 
 */
export function getMarkdownFromSelection(selection: BaseSelection | null) {
  if (selection === null) {
    return ""
  }
  const nodes = selection.getNodes()
  //   nodes are a list of nodes, each node has parent. prev, next. rebuild a node tree

  const editor = createHeadlessEditor({
    nodes: getAllNodes(),
    onError: () => { },
  })
  const _nodes = nodes.map((node) => node.exportJSON())

  try {
    const _state = {
      root: {
        children: [
          {
            children: [],
            direction: null,
            format: "",
            indent: 0,
            type: "paragraph",
            version: 1,
          },
          ..._nodes,
        ],
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    }
    console.log(_state)
    const state = editor.parseEditorState(JSON.stringify(_state))
    console.log(state)
    if (state.isEmpty()) {
      return ""
    }
    editor.update(
      () => {
        const root = $getRoot()
        const markdown = $convertToMarkdownString(allTransformers)
        console.log("markdown", markdown)
        return markdown
      },
      {
        discrete: true,
      }
    )
  } catch (error) { }
}
