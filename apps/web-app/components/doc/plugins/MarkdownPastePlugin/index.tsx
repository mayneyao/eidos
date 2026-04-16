import { useEffect } from "react"
import type { Transformer } from "@lexical/markdown"
import { $convertFromMarkdownString } from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { mergeRegister } from "@lexical/utils"
import { CodeNode } from "@lexical/code"
import { createHeadlessEditor } from "@lexical/headless"
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $nodesOfType,
  $parseSerializedNode,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
} from "lexical"

import { $createMermaidNode } from "../../blocks/mermaid/node"
import { getAllNodes } from "../../nodes"

function looksLikeMarkdown(text: string): boolean {
  if (!text || text.trim().length === 0) return false

  const patterns = [
    /^#{1,6}\s+/m, // heading
    /^(\*|-)\s+/m, // unordered list
    /^\d+\.\s+/m, // ordered list
    /```[\s\S]*?```/, // fenced code block
    /`[^`]+`/, // inline code
    /\[[^\]]+\]\([^)]+\)/, // link
    /!\[[^\]]*\]\([^)]+\)/, // image
    /^>\s+/m, // blockquote
    /^(\*{3}|-{3}|_{3})\s*$/m, // horizontal rule
    /\*\*[^*]+\*\*/, // bold asterisk
    /__[^_]+__/, // bold underscore
  ]
  return patterns.some((p) => p.test(text))
}

export function MarkdownPastePlugin({
  transformers,
}: {
  transformers: Transformer[]
}): null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          const clipboardEvent = event as ClipboardEvent
          const clipboardData = clipboardEvent.clipboardData
          if (!clipboardData) {
            return false
          }

          const html = clipboardData.getData("text/html")
          const text = clipboardData.getData("text/plain")

          // If there's rich HTML and it's different from plain text,
          // let the default handler process it
          if (html && html.trim().length > 0 && html.trim() !== text.trim()) {
            console.log(
              "[MarkdownPaste] rich HTML found, skipping markdown paste"
            )
            return false
          }

          const hasMarkdownMime = Array.from(clipboardData.types).includes(
            "text/markdown"
          )
          const isMarkdown = looksLikeMarkdown(text)
          console.log(
            "[MarkdownPaste] text:",
            text.slice(0, 100),
            "hasMarkdownMime:",
            hasMarkdownMime,
            "looksLikeMarkdown:",
            isMarkdown
          )

          if (!text || (!hasMarkdownMime && !isMarkdown)) {
            return false
          }

          clipboardEvent.preventDefault()

          // Convert markdown in a headless editor, then clone the nodes
          // into the main editor via JSON serialization.
          ;(async () => {
            try {
              const tmpEditor = createHeadlessEditor({
                nodes: getAllNodes(),
                onError: (error) => {
                  console.error("MarkdownPastePlugin headless error:", error)
                },
              })

              await new Promise<void>((resolve) => {
                tmpEditor.update(
                  () => {
                    $convertFromMarkdownString(
                      text,
                      transformers,
                      undefined,
                      true
                    )
                    // Convert mermaid code blocks to mermaid nodes
                    for (const code of $nodesOfType(CodeNode)) {
                      const lang = code.getLanguage()
                      if (lang === "mermaid") {
                        code.replace($createMermaidNode(code.getTextContent()))
                      }
                    }
                  },
                  {
                    discrete: true,
                    onUpdate: resolve,
                  }
                )
              })

              // Use editorState.toJSON() instead of reading+exporting nodes
              // to avoid cross-editor state issues.
              const stateJson = tmpEditor.getEditorState().toJSON()
              console.log("[MarkdownPaste] stateJson:", stateJson)
              const serializedNodes = stateJson.root.children as any[]
              console.log(
                "[MarkdownPaste] serializedNodes count:",
                serializedNodes.length
              )

              editor.update(() => {
                const selection = $getSelection()
                if ($isRangeSelection(selection)) {
                  const nodes = serializedNodes
                    .map((json) => {
                      try {
                        const node = $parseSerializedNode(json)
                        console.log(
                          "[MarkdownPaste] parsed node:",
                          node.getType(),
                          node.getTextContent?.()
                        )
                        return node
                      } catch (e) {
                        console.error(
                          "[MarkdownPaste] parse failed for:",
                          json,
                          e
                        )
                        return null
                      }
                    })
                    .filter(Boolean) as any[]

                  console.log("[MarkdownPaste] inserting nodes:", nodes.length)
                  selection.insertNodes(nodes)
                }
              })
            } catch (error) {
              console.error("MarkdownPastePlugin error:", error)
              // fallback: insert raw text
              editor.update(() => {
                const selection = $getSelection()
                if ($isRangeSelection(selection)) {
                  selection.insertText(text)
                }
              })
            }
          })()

          return true
        },
        COMMAND_PRIORITY_HIGH
      )
    )
  }, [editor, transformers])

  return null
}
