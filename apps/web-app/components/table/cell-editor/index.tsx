import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { getFieldInstance } from "@/packages/core/fields"
import { FieldType } from "@/packages/core/fields/const"
import type { FileField } from "@/packages/core/fields/file"
import type { SelectProperty } from "@/packages/core/fields/select"
import type { IField } from "@/packages/core/types/IField"
import { useClickAway, useDebounceFn } from "ahooks"

import { cn } from "@/lib/utils"
import type { FileCell } from "@/components/table/views/grid/cells/file/file-cell"

import { CheckboxEditor } from "./checkbox-editor"
import { DateEditor } from "./date-editor"
import { FileEditor } from "./file-editor"
import { MultiSelectEditor } from "./multi-select-editor"
import { RatingEditor } from "./rating-editor"
import { SelectEditor } from "./select-editor"
import { TextBaseEditor } from "./text-base-editor"
import type { CellEditorProps, CellEditorRef } from "./types"
export type { CellEditorProps, CellEditorRef }
import { UrlEditor } from "./url-editor"
import { UserProfileEditor } from "./user-profile-editor"

export const CellEditorMap: Record<
  FieldType,
  React.FC<CellEditorProps<any>> | null
> = {
  [FieldType.Checkbox]: CheckboxEditor,
  [FieldType.Date]: DateEditor,
  [FieldType.DateTime]: DateEditor,
  [FieldType.Text]: TextBaseEditor,
  [FieldType.Title]: TextBaseEditor,
  [FieldType.URL]: UrlEditor,
  [FieldType.Number]: TextBaseEditor,
  [FieldType.Select]: SelectEditor as any,
  [FieldType.MultiSelect]: MultiSelectEditor as any,
  [FieldType.File]: FileEditor,
  [FieldType.Rating]: RatingEditor,
  [FieldType.Link]: null,
  [FieldType.Lookup]: null,
  // readonly
  [FieldType.Formula]: TextBaseEditor,
  [FieldType.CreatedTime]: TextBaseEditor,
  [FieldType.CreatedBy]: UserProfileEditor,
  [FieldType.LastEditedTime]: TextBaseEditor,
  [FieldType.LastEditedBy]: UserProfileEditor,
}

interface ICellEditorProps {
  field: IField
  value: any
  onChange: (value: any) => void
  className?: string
  editorMode?: boolean
  disableTextBaseEditor?: boolean
  disabled?: boolean
  inline?: boolean
  onFinishEditing?: () => void
  onCancelEditing?: () => void
  multiline?: boolean
  /**
   * When true, display full content even in non-editing state (no line break truncation),
   * used for scenarios like doc-property that need to always show complete content
   */
  displayMode?: boolean
  /**
   * Layout mode:
   * - "fill": Absolute positioning to fill parent container (for fixed height scenarios like doc-property)
   * - "flow": Flow layout, adaptive width and height (for gallery card, filter, etc.)
   * - "inline": Inline layout, width adapts to content (for checkbox, etc.)
   * @default "flow"
   */
  layout?: "fill" | "flow" | "inline"
}

export const CellEditor = forwardRef<CellEditorRef, ICellEditorProps>(
  (
    {
      field,
      value,
      onChange,
      className,
      editorMode,
      disableTextBaseEditor,
      disabled,
      inline,
      onFinishEditing,
      onCancelEditing,
      multiline = false,
      displayMode = false,
      layout = "flow",
    },
    ref
  ) => {
    const { run } = useDebounceFn(onChange, { wait: 500 })
    const [isEditing, setIsEditing] = useState(false)
    const editorRef = useRef<HTMLDivElement>(null)
    const textBaseEditorRef = useRef<CellEditorRef>(null)
    const urlEditorRef = useRef<CellEditorRef>(null)
    const ratingEditorRef = useRef<CellEditorRef>(null)

    const handleFinishEditing = useCallback(() => {
      setIsEditing(false)
      onFinishEditing?.()
    }, [onFinishEditing])

    const handleCancelEditing = useCallback(() => {
      setIsEditing(false)
      onCancelEditing?.()
    }, [onCancelEditing])

    useImperativeHandle(
      ref,
      () => ({
        startEditing: () => {
          if (!disabled) {
            setIsEditing(true)
            setTimeout(() => {
              textBaseEditorRef.current?.focus()
              urlEditorRef.current?.focus()
              ratingEditorRef.current?.focus()
            }, 0)
          }
        },
        finishEditing: handleFinishEditing,
        cancelEditing: handleCancelEditing,
        focus: () => {
          textBaseEditorRef.current?.focus()
          urlEditorRef.current?.focus()
          ratingEditorRef.current?.focus()
        },
      }),
      [disabled, handleFinishEditing, handleCancelEditing]
    )

    useClickAway(
      (e) => {
        if (editorRef.current?.contains(e.target as Node)) return
        setIsEditing(false)
      },
      editorRef,
      ["mousedown", "touchstart"]
    )

    const fieldInstance = useMemo(() => {
      if (!field) return null
      return getFieldInstance(field) as FileField
    }, [field])

    const cell = useMemo(() => {
      return fieldInstance?.getCellContent(value as never) as FileCell
    }, [fieldInstance, value])

    const onFileCellChange = useCallback(
      (cell: FileCell) => {
        if (!fieldInstance) return
        const value = fieldInstance.cellData2RawData(cell)
        run(value.rawData)
      },
      [fieldInstance, run]
    )

    if (!field) return null
    const _isEditing = disabled ? false : editorMode ? true : isEditing

    const getEditor = () => {
      const Editor = CellEditorMap[field.type]
      const commonProps = {
        isEditing: _isEditing,
        onFinishEditing: handleFinishEditing,
        onCancelEditing: handleCancelEditing,
        layout,
        disabled,
      }

      switch (field.type) {
        case FieldType.Text:
        case FieldType.Title:
          return (
            <TextBaseEditor
              ref={textBaseEditorRef}
              type="text"
              value={value}
              onChange={run}
              {...commonProps}
              isEditing={disableTextBaseEditor ? false : _isEditing}
              multiline={multiline}
              displayMode={displayMode}
            />
          )
        case FieldType.URL:
          return (
            <UrlEditor
              ref={urlEditorRef}
              value={value}
              onChange={run}
              {...commonProps}
              isEditing={disableTextBaseEditor ? false : _isEditing}
              multiline={multiline}
              displayMode={displayMode}
            />
          )
        case FieldType.Number:
          return (
            <TextBaseEditor
              ref={textBaseEditorRef}
              type="number"
              value={value}
              onChange={run}
              {...commonProps}
              isEditing={disableTextBaseEditor ? false : _isEditing}
              displayMode={displayMode}
            />
          )
        case FieldType.Select:
          return (
            <SelectEditor
              value={value}
              onChange={run}
              options={
                (field as IField<SelectProperty>).property?.options || []
              }
              {...commonProps}
            />
          )
        case FieldType.MultiSelect:
          return (
            <MultiSelectEditor
              value={value}
              onChange={run}
              options={
                (field as IField<SelectProperty>).property?.options || []
              }
              {...commonProps}
              inline={inline}
            />
          )
        case FieldType.Date:
        case FieldType.DateTime:
          return <DateEditor value={value} onChange={run} {...commonProps} />
        case FieldType.Checkbox:
          return (
            <CheckboxEditor value={value} onChange={run} {...commonProps} />
          )
        case FieldType.Rating:
          return (
            <RatingEditor
              ref={ratingEditorRef}
              value={value}
              onChange={run}
              {...commonProps}
            />
          )
        case FieldType.File:
          return (
            <FileEditor
              value={cell}
              onChange={onFileCellChange}
              isEditing={_isEditing}
              layout={layout}
              disabled={disabled}
            />
          )
        case FieldType.CreatedTime:
        case FieldType.LastEditedTime:
          return (
            <TextBaseEditor
              ref={textBaseEditorRef}
              type="text"
              value={new Date(value).toLocaleString()}
              onChange={run}
              {...commonProps}
              isEditing={false}
            />
          )
        case FieldType.Formula:
          return (
            <TextBaseEditor
              ref={textBaseEditorRef}
              type="text"
              value={value}
              onChange={run}
              {...commonProps}
              isEditing={false}
            />
          )
        default:
          return Editor ? (
            <Editor value={value} onChange={run} {...commonProps} />
          ) : null
      }
    }

    const Editor = getEditor()

    // Select wrapper styles based on layout mode
    // flow mode: no padding when disabled, px-2 when editable (for editing state visual)
    const wrapperClasses = cn(
      {
        "relative w-full h-full": layout === "fill",
        "w-full": layout === "flow" && disabled,
        "w-full px-2": layout === "flow" && !disabled,
        "inline-flex": layout === "inline",
      },
      className
    )

    return (
      <div
        ref={editorRef}
        onClick={() => setIsEditing(true)}
        className={wrapperClasses}
      >
        {Editor}
      </div>
    )
  }
)

CellEditor.displayName = "CellEditor"
