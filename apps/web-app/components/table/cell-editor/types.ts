export interface CellEditorProps<T = any> {
  value: T
  onChange: (value: T) => void
  isEditing: boolean
  onFinishEditing?: () => void
  onCancelEditing?: () => void
  /**
   * Layout mode:
   * - "fill": Absolute positioning to fill parent container (for fixed height scenarios like doc-property)
   * - "flow": Flow layout, adaptive width and height (for gallery card, filter, etc.)
   * - "inline": Inline layout, width adapts to content (for checkbox, etc.)
   * @default "flow"
   */
  layout?: "fill" | "flow" | "inline"
  disabled?: boolean
  /** When true, suppress auto-open of popover (e.g. when used in filter editor) */
  noAutoOpen?: boolean
}

export interface CellEditorRef {
  startEditing: () => void
  finishEditing: () => void
  cancelEditing: () => void
  focus: () => void
}
