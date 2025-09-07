import { useCallback, useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getNodeByKey, $getSelection, $isRangeSelection } from "lexical"

/**
 * Check if the cursor is at the start of the document
 * Handles different node structures:
 * 1. root => paragraph => text
 * 2. root => list => listitem => text
 */
export function $isAtDocumentStart() {
  const selection = $getSelection()
  if (!selection || !$isRangeSelection(selection)) return false

  const anchor = selection.anchor
  const anchorNode = $getNodeByKey(anchor.key)
  if (!anchorNode) return false

  // First check if cursor is at start
  if (anchor.offset !== 0) return false

  // Get parent node (usually paragraph or listitem)
  const parentNode = anchorNode.getParent()
  
  if (!parentNode) {
    // Special case: if this is already a paragraph node, treat it as the container
    if (anchorNode.getType() === "paragraph") {
      const isFirstChild = !anchorNode.getPreviousSibling()
      const parent = anchorNode.getParent()
      const isRootChild = parent?.getType() === "root"
      return isFirstChild && isRootChild
    }
    return false
  }

  // Handle paragraph case
  if (parentNode.getType() === "paragraph") {
    if (parentNode.getPreviousSibling()) return false
    return parentNode.getParent()?.getType() === "root"
  }

  // Handle list case
  if (parentNode.getType() === "listitem" || parentNode.getType() === "list") {
    return false
  }

  // For other cases, find top-level node
  let topLevelNode = anchorNode
  while (topLevelNode.getParent()?.getParent()) {
    topLevelNode = topLevelNode.getParent()!
  }

  return (
    !topLevelNode.getPreviousSibling() && // No previous sibling for the top-level block
    topLevelNode.getParent()?.getType() === "root" // Direct child of root
  )
}

interface PropertyNavigationPluginProps {
  isEditable?: boolean
}

/**
 * Plugin to handle navigation from document content to property panel
 * When user presses up arrow at the start of document, it activates property editing
 */
export function PropertyNavigationPlugin(props: PropertyNavigationPluginProps) {
  const [editor] = useLexicalComposerContext()
  const { isEditable = true } = props

  // Handle keydown events to detect up arrow at document start
  useEffect(() => {
    if (!isEditable) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle up arrow key
      if (event.key !== "ArrowUp") return
      
      editor.getEditorState().read(() => {
        if ($isAtDocumentStart()) {
          // Dispatch custom event to activate property editing
          window.dispatchEvent(new CustomEvent("eidos-property-activate"))
          event.preventDefault()
          event.stopPropagation()
        }
      })
    }

    const rootElement = editor.getRootElement()
    if (rootElement) {
      rootElement.addEventListener("keydown", handleKeyDown)
    }

    return () => {
      if (rootElement) {
        rootElement.removeEventListener("keydown", handleKeyDown)
      }
    }
  }, [editor, isEditable])

  return null
}
