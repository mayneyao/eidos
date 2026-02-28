import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import type { LexicalCommand } from "lexical"
import { COMMAND_PRIORITY_EDITOR, createCommand } from "lexical"
import { useEffect } from "react"

import { $insertDecoratorBlockNode } from "../helper"
import { $createChartNode, ChartNode } from "./node"

export const INSERT_CHART_COMMAND: LexicalCommand<string> = createCommand()

export function ChartPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    if (!editor.hasNodes([ChartNode])) {
      throw new Error(
        "ChartPlugin: ChartNode not registered on editor (initialConfig.nodes)"
      )
    }
    return editor.registerCommand<string>(
      INSERT_CHART_COMMAND,
      (payload) => {
        const node = $createChartNode(payload)
        $insertDecoratorBlockNode(node)
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])
  return null
}
