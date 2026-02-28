import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getSelection, $insertNodes, $isRangeSelection } from "lexical"
import { useEffect, useState } from "react"

import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { $createMentionNode } from "@/components/doc/blocks/mention/node"
import { useQueryNode } from "@/apps/web-app/hooks/use-query-node"
import { useContextNodes } from "../../hooks/use-context-nodes"

export function DragDropPlugin({
  onNodeInsert,
}: {
  onNodeInsert?: (node: ITreeNode) => void
}) {
  const [editor] = useLexicalComposerContext()
  const [isDragOver, setIsDragOver] = useState(false)
  const { getNode } = useQueryNode()
  const { hasNode, addNode } = useContextNodes()

  useEffect(() => {
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer!.dropEffect = "copy"
      setIsDragOver(true)
    }

    const handleDragEnter = (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      setIsDragOver(true)
    }

    const handleDragLeave = (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      // Only hide drag over state if leaving the editor entirely
      const editorElement = editor.getRootElement()
      if (
        editorElement &&
        !editorElement.contains(event.relatedTarget as Node)
      ) {
        setIsDragOver(false)
      }
    }

    const handleDrop = async (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      setIsDragOver(false)

      try {
        const nodeId = event.dataTransfer?.getData("text/plain")
        if (!nodeId) return

        // Check if node is already mentioned to avoid duplicates
        if (hasNode(nodeId)) {
          console.log("Node already mentioned, skipping")
          return
        }

        // Get the full node data
        const treeNode = await getNode(nodeId)
        if (!treeNode) {
          console.error("Could not find node with ID:", nodeId)
          return
        }

        // Insert mention node
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            const mentionNode = $createMentionNode(treeNode.id, treeNode.name)
            $insertNodes([mentionNode])

            // Add to context nodes using the centralized management
            addNode(treeNode)
            onNodeInsert?.(treeNode)

            console.log(
              "Successfully inserted mention node for:",
              treeNode.name
            )
          }
        })
      } catch (error) {
        console.error("Error handling drop:", error)
      }
    }

    const editorElement = editor.getRootElement()
    if (editorElement) {
      editorElement.addEventListener("dragover", handleDragOver)
      editorElement.addEventListener("dragenter", handleDragEnter)
      editorElement.addEventListener("dragleave", handleDragLeave)
      editorElement.addEventListener("drop", handleDrop)

      return () => {
        editorElement.removeEventListener("dragover", handleDragOver)
        editorElement.removeEventListener("dragenter", handleDragEnter)
        editorElement.removeEventListener("dragleave", handleDragLeave)
        editorElement.removeEventListener("drop", handleDrop)
        setIsDragOver(false)
      }
    }
  }, [editor, onNodeInsert, getNode, hasNode, addNode])

  // Add visual feedback for drag over state
  useEffect(() => {
    const editorElement = editor.getRootElement()
    if (editorElement) {
      if (isDragOver) {
        editorElement.style.backgroundColor = "rgba(59, 130, 246, 0.1)" // blue-500 with 10% opacity
        editorElement.style.borderColor = "rgb(59, 130, 246)" // blue-500
        editorElement.style.borderWidth = "2px"
        editorElement.style.borderStyle = "dashed"
      } else {
        editorElement.style.backgroundColor = ""
        editorElement.style.borderColor = ""
        editorElement.style.borderWidth = ""
        editorElement.style.borderStyle = ""
      }
    }
  }, [editor, isDragOver])

  return null
}
