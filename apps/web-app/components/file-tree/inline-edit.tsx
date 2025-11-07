import React, { useEffect, useRef } from "react"

interface InlineEditProps {
  /** The current value to display/edit */
  value: string
  /** Whether the element is in edit mode */
  isEditing: boolean
  /** Optional node type to determine selection behavior */
  nodeType?: "extension" | "table" | "doc" | "folder" | "dataview"
  /** Callback when edit is confirmed (Enter or Blur) */
  onConfirm: (newValue: string) => void
  /** Callback when edit is cancelled (Esc) */
  onCancel: () => void
  /** Additional CSS classes */
  className?: string
}

/**
 * InlineEdit - A reusable component for inline text editing with smart extension handling
 * 
 * Features:
 * - VSCode-like inline editing with contenteditable
 * - Smart text selection based on node type
 * - For extensions: selects full name (including .ts/.tsx)
 * - For docs/tables: selects only filename (excluding common extensions)
 * - For version numbers (e.g., "v0.25 changelog"): selects full text
 * - Keyboard navigation: Enter to confirm, Esc to cancel
 * - Auto-confirm on blur
 */
export const InlineEdit: React.FC<InlineEditProps> = ({
  value,
  isEditing,
  nodeType,
  onConfirm,
  onCancel,
  className = "truncate text-foreground",
}) => {
  const editRef = useRef<HTMLSpanElement>(null)

  /**
   * Calculate the selection end position based on node type and filename
   * 
   * Rules:
   * 1. Extensions: Select entire name (user should not modify .ts/.tsx suffix)
   * 2. Common file extensions: Exclude from selection (e.g., "file.md" -> "file")
   * 3. Version numbers or special names: Select entire text (e.g., "v0.25 changelog")
   */
  const getSelectionEndPosition = (name: string, type?: string): number => {
    // For extensions, always select the entire name including .ts/.tsx
    if (type === "extension") {
      return name.length
    }

    const lastDotIndex = name.lastIndexOf(".")

    // If no dot or dot is at start/end, select entire name
    if (lastDotIndex <= 0 || lastDotIndex >= name.length - 1) {
      return name.length
    }

    const extension = name.substring(lastDotIndex + 1)

    // Check if it's a valid file extension:
    // - Only alphanumeric characters
    // - Length between 2-5 characters
    const isValidExtension = /^[a-zA-Z0-9]{2,5}$/.test(extension)

    if (isValidExtension) {
      const commonExtensions = [
        "md",
        "txt",
        "pdf",
        "doc",
        "docx",
        "xls",
        "xlsx",
        "csv",
        "json",
        "xml",
        "html",
        "htm",
        "js",
        "ts",
        "tsx",
        "jsx",
        "css",
        "scss",
      ]

      // If it's a common extension, exclude it from selection
      if (commonExtensions.includes(extension.toLowerCase())) {
        return lastDotIndex
      }
    }

    // Otherwise, select the entire name (handles cases like "v0.25 changelog")
    return name.length
  }

  // Handle text selection when entering edit mode
  useEffect(() => {
    if (isEditing && editRef.current && value) {
      const element = editRef.current
      const selectionEnd = getSelectionEndPosition(value, nodeType)

      // Use setTimeout to ensure the element is fully focused
      setTimeout(() => {
        element.focus()

        // Use Selection API for contenteditable
        const range = document.createRange()
        const selection = window.getSelection()

        if (element.firstChild) {
          // Select from start to calculated end position
          range.setStart(element.firstChild, 0)
          range.setEnd(
            element.firstChild,
            Math.min(selectionEnd, element.textContent?.length || 0)
          )

          selection?.removeAllRanges()
          selection?.addRange(range)
        }
      }, 0)
    }
  }, [isEditing]) // Only run when entering edit mode

  const handleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      e.stopPropagation()
      const newValue = e.currentTarget.textContent || ""
      onConfirm(newValue)
    } else if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    // Delay to allow Enter key to be processed first
    setTimeout(() => {
      if (isEditing) {
        const newValue = e.currentTarget.textContent || ""
        onConfirm(newValue)
      }
    }, 100)
  }

  if (isEditing) {
    return (
      <span
        ref={editRef}
        contentEditable
        suppressContentEditableWarning
        className={`${className} outline-none`}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onClick={(e) => e.stopPropagation()}
      >
        {value}
      </span>
    )
  }

  return <span className={className}>{value}</span>
}

