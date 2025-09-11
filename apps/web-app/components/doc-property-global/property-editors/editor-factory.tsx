import React from "react"
import type { PropertyType } from "../types"
import type { PropertyEditorComponent, PropertyEditorRegistry } from "./types"
import { TextEditor } from "./text-editor"
import { NumberEditor } from "./number-editor"
import { BooleanEditor } from "./boolean-editor"
import { DateEditor } from "./date-editor"
import { TagsEditor } from "./tags-editor"

/**
 * Registry of all property editors
 */
export const propertyEditorRegistry: PropertyEditorRegistry = {
  text: TextEditor,
  number: NumberEditor,
  boolean: BooleanEditor,
  date: DateEditor,
  datetime: DateEditor,
  tags: TagsEditor,
}

/**
 * Get the appropriate editor component for a property type
 */
export const getPropertyEditor = (propertyType: PropertyType): PropertyEditorComponent => {
  return propertyEditorRegistry[propertyType] || TextEditor
}

/**
 * Factory component that renders the appropriate editor based on property type
 */
export const PropertyEditorFactory: React.FC<{
  propertyType: PropertyType
  value: any
  onChange: (value: any) => void
  isEditing?: boolean
  onFinishEdit?: () => void
  onCancelEdit?: () => void
  onStartEdit?: () => void
  autoFocus?: boolean
  readonly?: boolean
  isSystemProperty?: boolean
  isEmpty?: boolean
  propertyName?: string
}> = ({ propertyType, ...props }) => {
  const EditorComponent = getPropertyEditor(propertyType)
  
  return (
    <EditorComponent
      propertyType={propertyType}
      {...props}
    />
  )
}
