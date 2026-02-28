import React, { useEffect, useRef, useState } from "react"
import { BaseEditor, EmptyValue } from "./base-editor"
import type { PropertyEditorProps } from "./types"
import { isPropertyEmpty } from "../utils"

/**
 * Tags property editor component
 * Handles comma-separated tags with visual formatting
 */
export const TagsEditor: React.FC<PropertyEditorProps> = ({
  value,
  onChange,
  isEditing = false,
  onFinishEdit,
  onCancelEdit,
  onStartEdit,
  autoFocus = false,
  readonly = false,
  isSystemProperty = false,
  isEmpty: propIsEmpty,
}) => {
  const [editingValue, setEditingValue] = useState<string>("")
  const inputRef = useRef<HTMLInputElement>(null)

  const isEmpty = propIsEmpty ?? isPropertyEmpty(value)

  // Convert value to string for editing
  const valueToString = (val: any): string => {
    if (val === null || val === undefined) return ""
    return String(val)
  }

  // Parse tags from string
  const parseTags = (str: string): string[] => {
    if (!str) return []
    return str
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
  }

  // Format tags for display
  const formatTagsForDisplay = (val: any): React.ReactNode => {
    const tagsString = valueToString(val)
    const tags = parseTags(tagsString)

    if (tags.length === 0) return ""

    return (
      <div className="flex flex-wrap gap-1 items-center">
        {tags.map((tag, index) => (
          <span
            key={index}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground"
          >
            #{tag}
          </span>
        ))}
      </div>
    )
  }

  // Update editing value when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setEditingValue(valueToString(value))
    }
  }, [isEditing, value])

  // Auto focus when editing starts
  useEffect(() => {
    if (isEditing && autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing, autoFocus])

  const handleFinishEdit = () => {
    // Clean up the tags string
    const tags = parseTags(editingValue)
    const cleanedValue = tags.length > 0 ? tags.join(", ") : ""
    onChange(cleanedValue || null)
    onFinishEdit?.()
  }

  const handleCancelEdit = () => {
    setEditingValue(valueToString(value))
    onCancelEdit?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleFinishEdit()
    } else if (e.key === "Escape") {
      e.preventDefault()
      handleCancelEdit()
    }
  }

  const handleStartEdit = () => {
    if (!readonly && !isSystemProperty) {
      onStartEdit?.()
    }
  }

  if (isEditing) {
    return (
      <BaseEditor
        readonly={readonly}
        isSystemProperty={isSystemProperty}
        isEditing={isEditing}
      >
        <input
          ref={inputRef}
          type="text"
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleFinishEdit}
          className="w-full bg-transparent border-none outline-none focus:outline-none"
          placeholder="Enter tags separated by commas..."
        />
      </BaseEditor>
    )
  }

  if (isEmpty) {
    return (
      <EmptyValue
        onClick={handleStartEdit}
        readonly={readonly}
        isSystemProperty={isSystemProperty}
      />
    )
  }

  return (
    <BaseEditor
      onClick={handleStartEdit}
      readonly={readonly}
      isSystemProperty={isSystemProperty}
      className="absolute inset-0 flex items-center px-2 text-sm min-h-0"
    >
      {formatTagsForDisplay(value)}
    </BaseEditor>
  )
}
