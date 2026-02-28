import type { PropertyType } from "../types"

/**
 * Base interface for all property editors
 */
export interface BasePropertyEditorProps {
  /** The current value of the property */
  value: any
  /** Callback when value changes */
  onChange: (value: any) => void
  /** Whether the editor is in readonly mode */
  readonly?: boolean
  /** Whether this is a system property */
  isSystemProperty?: boolean
  /** Property name for context */
  propertyName?: string
  /** Property type */
  propertyType: PropertyType
}

/**
 * Props for display-only mode
 */
export interface PropertyDisplayProps extends Omit<
  BasePropertyEditorProps,
  "onChange"
> {
  /** Whether the value is empty */
  isEmpty?: boolean
  /** Callback when user clicks to start editing */
  onStartEdit?: () => void
}

/**
 * Props for edit mode
 */
export interface PropertyEditProps extends BasePropertyEditorProps {
  /** Whether the editor is currently in edit mode */
  isEditing: boolean
  /** Callback when editing is finished */
  onFinishEdit: () => void
  /** Callback when editing is cancelled */
  onCancelEdit?: () => void
  /** Auto focus when editing starts */
  autoFocus?: boolean
}

/**
 * Combined editor component props that handles both display and edit modes
 */
export interface PropertyEditorProps extends BasePropertyEditorProps {
  /** Whether the editor is currently in edit mode */
  isEditing?: boolean
  /** Callback when editing is finished */
  onFinishEdit?: () => void
  /** Callback when editing is cancelled */
  onCancelEdit?: () => void
  /** Callback when user wants to start editing */
  onStartEdit?: () => void
  /** Auto focus when editing starts */
  autoFocus?: boolean
  /** Whether the value is empty */
  isEmpty?: boolean
}

/**
 * Editor component type
 */
export type PropertyEditorComponent = React.ComponentType<PropertyEditorProps>

/**
 * Editor registry type
 */
export type PropertyEditorRegistry = {
  [K in PropertyType]: PropertyEditorComponent
}
