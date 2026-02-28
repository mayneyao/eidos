import React, { useEffect, useRef, useState } from "react"
import { BaseEditor, EmptyValue } from "./base-editor"
import type { PropertyEditorProps } from "./types"
import { isPropertyEmpty } from "../utils"

/**
 * Text property editor component
 * Handles text input with inline editing
 */
export const TextEditor: React.FC<PropertyEditorProps> = ({
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

  // Update editing value when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setEditingValue(String(value || ""))
    }
  }, [isEditing, value])

  // Auto focus when editing starts
  useEffect(() => {
    if (isEditing && autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing, autoFocus])

  const handleFinishEdit = () => {
    onChange(editingValue)
    onFinishEdit?.()
  }

  const handleCancelEdit = () => {
    setEditingValue(String(value || ""))
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
          placeholder="Enter text..."
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
    >
      <span className="text-foreground truncate">{String(value)}</span>
    </BaseEditor>
  )
}
