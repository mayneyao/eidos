import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { COMMAND_PRIORITY_EDITOR, LexicalCommand, createCommand } from "lexical"
import { useEffect } from "react"

import { $insertDecoratorBlockNode } from "../helper"
import { $createMermaidNode, MermaidNode } from "./node"

export const INSERT_MERMAID_COMMAND: LexicalCommand<string> = createCommand()

export function MermaidPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    if (!editor.hasNodes([MermaidNode])) {
      throw new Error(
        "MermaidPlugin: MermaidNode not registered on editor (initialConfig.nodes)"
      )
    }

    return editor.registerCommand<string>(
      INSERT_MERMAID_COMMAND,
      (payload) => {
        const node = $createMermaidNode(payload)
        $insertDecoratorBlockNode(node)
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])

  return null
}
