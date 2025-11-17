import React, { useEffect, useRef, useState } from "react"

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
 * - VSCode-like inline editing with input element
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
  const editRef = useRef<HTMLInputElement>(null)
  const [editValue, setEditValue] = useState(value)
  const prevEditingRef = useRef(isEditing)

  // Sync editValue with value prop only when entering edit mode (not when value changes during editing)
  useEffect(() => {
    // Only sync when transitioning from non-editing to editing mode
    if (isEditing && !prevEditingRef.current) {
      setEditValue(value)
    }
    prevEditingRef.current = isEditing
  }, [isEditing, value])

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
    if (isEditing && editRef.current && editValue) {
      const element = editRef.current
      const selectionEnd = getSelectionEndPosition(editValue, nodeType)

      // Use setTimeout to ensure the element is fully focused
      setTimeout(() => {
        element.focus()

        // Use setSelectionRange for input element
        const endPosition = Math.min(selectionEnd, editValue.length)
        element.setSelectionRange(0, endPosition)
      }, 0)
    }
    // Only run when entering edit mode or nodeType changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, nodeType])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Only handle keyboard events if this input is actually focused
    // This prevents accidental triggers when other elements handle Enter
    if (document.activeElement !== e.currentTarget) {
      return
    }

    if (e.key === "Enter") {
      e.preventDefault()
      e.stopPropagation()
      const newValue = e.currentTarget.value || ""
      onConfirm(newValue)
    } else if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      setEditValue(value) // Reset to original value
      onCancel()
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Only confirm if we're still in editing mode and the element is not focused
    // This prevents triggering when user clicks elsewhere or presses Enter in another element
    // Also add a small delay to prevent context menu close events from triggering blur
    if (isEditing && document.activeElement !== e.currentTarget) {
      // Use setTimeout to ensure this is a real blur event, not from context menu closing
      setTimeout(() => {
        // Double-check that we're still in editing mode and element is not focused
        // This prevents race conditions with context menu close events
        if (isEditing && document.activeElement !== e.currentTarget) {
          const newValue = e.currentTarget.value || ""
          onConfirm(newValue)
        }
      }, 100)
    }
  }

  if (isEditing) {
    return (
      <input
        ref={editRef}
        type="text"
        value={editValue}
        onChange={(e) => {
          setEditValue(e.target.value)
        }}
        className={`${className} outline-none bg-transparent border-none p-0 m-0`}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onClick={(e) => e.stopPropagation()}
        style={{
          // Remove default input styling to make it look like plain text
          boxShadow: "none",
          appearance: "none",
          WebkitAppearance: "none",
          MozAppearance: "textfield",
        }}
      />
    )
  }

  return <span className={className}>{value}</span>
}
