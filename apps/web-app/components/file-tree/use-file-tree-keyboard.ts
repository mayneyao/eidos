import { useEffect, useRef } from "react"

interface UseFileTreeKeyboardOptions {
  selectedNode: string | null
  renamingNode: string | null
  treeContainerRef: React.RefObject<HTMLDivElement>
  onRename: (nodePath: string) => void
  onClearSelection: () => void
}

/**
 * Hook for managing keyboard and mouse events in the file tree
 */
export const useFileTreeKeyboard = ({
  selectedNode,
  renamingNode,
  treeContainerRef,
  onRename,
  onClearSelection,
}: UseFileTreeKeyboardOptions) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if we're already renaming
      if (renamingNode) return

      // Don't trigger if focus is on a form input element (outside of dialogs)
      // Note: We don't block contenteditable elements (like document editors)
      // because users may want to rename nodes while editing documents
      const activeElement = document.activeElement
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA")
      ) {
        return
      }

      // Use F2 to start rename to avoid conflicting with navigation Enter/Space
      if (e.key === "F2" && selectedNode) {
        e.preventDefault()
        e.stopPropagation()
        onRename(selectedNode)
      }
    }

    // Handle click outside to clear selection
    const handleClickOutside = (e: MouseEvent) => {
      const treeContainer = treeContainerRef.current

      // Don't treat ContextMenu clicks as external clicks
      const target = e.target as Node
      if (target && target instanceof Element) {
        // Check if click is inside any ContextMenu (Radix UI uses specific attributes)
        const contextMenu = target.closest('[data-state], [role="menu"]')
        if (contextMenu) {
          return // This is a ContextMenu click, ignore
        }
      }

      if (treeContainer && !treeContainer.contains(e.target as Node)) {
        onClearSelection()
      }
    }

    const isContextMenuElement = (node: Node | null) => {
      if (!node || !(node instanceof Element)) return false
      return Boolean(node.closest('[data-state], [role="menu"]'))
    }

    // Handle blur to clear selection when focus moves outside (but keep when context menu opens)
    const handleBlur = (e: FocusEvent) => {
      // Check if the focus is moving outside of the tree container
      const treeContainer = treeContainerRef.current
      const nextTarget = e.relatedTarget as Node | null

      // If focus moves to context menu (or null during menu open), keep selection
      if (isContextMenuElement(nextTarget) || nextTarget === null) {
        return
      }

      if (treeContainer && !treeContainer.contains(nextTarget)) {
        onClearSelection()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    document.addEventListener("mousedown", handleClickOutside)
    // Use capture phase to catch blur events before they bubble
    window.addEventListener("blur", handleBlur, true)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("mousedown", handleClickOutside)
      window.removeEventListener("blur", handleBlur, true)
    }
  }, [selectedNode, renamingNode, treeContainerRef, onRename, onClearSelection])
}
