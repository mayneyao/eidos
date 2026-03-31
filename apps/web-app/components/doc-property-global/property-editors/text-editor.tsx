import React, { useEffect, useMemo, useRef, useState } from "react"
import { BaseEditor, EmptyValue } from "./base-editor"
import type { PropertyEditorProps } from "./types"
import { isPropertyEmpty } from "../utils"

/**
 * Text property editor component
 * Handles text input with inline editing and multi-line support
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isEmpty = propIsEmpty ?? isPropertyEmpty(value)
  const strValue = String(value || "")

  // Simple heuristic: contains newline or is long
  const isMultiline = useMemo(() => {
    const valueToCheck = isEditing ? editingValue || strValue : strValue
    return valueToCheck.includes("\n") || valueToCheck.length > 50
  }, [isEditing, editingValue, strValue])

  // Update editing value when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setEditingValue(strValue)
    }
  }, [isEditing, strValue])

  // Auto focus when editing starts
  useEffect(() => {
    if (isEditing && autoFocus) {
      if (isMultiline && textareaRef.current) {
        const textarea = textareaRef.current
        textarea.focus()
        const length = textarea.value.length
        textarea.setSelectionRange(length, length)
      } else if (inputRef.current) {
        const input = inputRef.current
        input.focus()
        const length = input.value.length
        input.setSelectionRange(length, length)
      }
    }
  }, [isEditing, autoFocus, isMultiline])

  // Auto resize textarea to match content height
  useEffect(() => {
    if (isEditing && isMultiline && textareaRef.current) {
      const textarea = textareaRef.current
      textarea.style.height = "auto"
      textarea.style.height = textarea.scrollHeight + "px"
    }
  }, [editingValue, isEditing, isMultiline])

  const handleFinishEdit = () => {
    onChange(editingValue)
    onFinishEdit?.()
  }

  const handleCancelEdit = () => {
    setEditingValue(strValue)
    onCancelEdit?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
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
    if (isMultiline) {
      return (
        <BaseEditor
          readonly={readonly}
          isSystemProperty={isSystemProperty}
          isEditing={isEditing}
          isMultiline={isMultiline}
        >
          <textarea
            ref={textareaRef}
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleFinishEdit}
            className="w-full bg-transparent border-none outline-hidden focus:outline-hidden resize-none overflow-hidden leading-[1.5] m-0 p-0"
            placeholder="Enter text..."
            rows={1}
          />
        </BaseEditor>
      )
    }
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
          className="w-full bg-transparent border-none outline-hidden focus:outline-hidden"
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

  // Display mode
  return (
    <BaseEditor
      onClick={handleStartEdit}
      readonly={readonly}
      isSystemProperty={isSystemProperty}
      isMultiline={isMultiline}
    >
      <span
        className={
          isMultiline
            ? "text-foreground whitespace-pre-wrap break-words w-full leading-[1.5]"
            : "text-foreground truncate"
        }
      >
        {strValue}
      </span>
    </BaseEditor>
  )
}
