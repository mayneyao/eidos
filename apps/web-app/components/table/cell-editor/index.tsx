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
import { UrlEditor } from "./url-editor"
import { UserProfileEditor } from "./user-profile-editor"

export const CellEditorMap: Record<
  FieldType,
  React.FC<{
    isEditing: boolean
    value: any
    type?: any
    onChange: (value: any) => void
  }> | null
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
}

export interface CellEditorRef {
  startEditing: () => void
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
    },
    ref
  ) => {
    const { run } = useDebounceFn(onChange, { wait: 500 })
    const [isEditing, setIsEditing] = useState(false)
    const editorRef = useRef<HTMLDivElement>(null)

    useImperativeHandle(
      ref,
      () => ({
        startEditing: () => {
          if (!disabled) {
            setIsEditing(true)
          }
        },
      }),
      [disabled, isEditing]
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
      const handleFinishEditing = () => {
        setIsEditing(false)
        onFinishEditing?.()
      }

      switch (field.type) {
        case FieldType.Text:
        case FieldType.Title:
          return (
            <TextBaseEditor
              type="text"
              value={value}
              onChange={run}
              isEditing={disableTextBaseEditor ? false : _isEditing}
              onFinishEditing={handleFinishEditing}
            />
          )
        case FieldType.URL:
          return (
            <UrlEditor
              value={value}
              onChange={run}
              isEditing={disableTextBaseEditor ? false : _isEditing}
              onFinishEditing={handleFinishEditing}
            />
          )
        case FieldType.Number:
          return (
            <TextBaseEditor
              type="number"
              value={value}
              onChange={run}
              isEditing={disableTextBaseEditor ? false : _isEditing}
              onFinishEditing={handleFinishEditing}
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
              isEditing={_isEditing}
              onFinishEditing={handleFinishEditing}
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
              isEditing={_isEditing}
              inline={inline}
              onFinishEditing={handleFinishEditing}
            />
          )
        case FieldType.Date:
          return (
            <DateEditor
              value={value}
              onChange={run}
              isEditing={_isEditing}
              onFinishEditing={handleFinishEditing}
            />
          )
        case FieldType.Checkbox:
          return (
            <CheckboxEditor
              value={value}
              onChange={run}
              isEditing={_isEditing}
              onFinishEditing={handleFinishEditing}
            />
          )
        case FieldType.Rating:
          return (
            <RatingEditor
              value={value}
              onChange={run}
              isEditing={_isEditing}
              onFinishEditing={handleFinishEditing}
            />
          )
        case FieldType.File:
          return (
            <FileEditor value={cell} onChange={onFileCellChange}></FileEditor>
          )
        case FieldType.CreatedTime:
        case FieldType.LastEditedTime:
          return (
            <TextBaseEditor
              type="text"
              value={new Date(value).toLocaleString()}
              onChange={run}
              isEditing={false}
              onFinishEditing={handleFinishEditing}
            />
          )
        case FieldType.Formula:
          return (
            <TextBaseEditor
              type="text"
              value={value}
              onChange={run}
              isEditing={false}
              onFinishEditing={handleFinishEditing}
            />
          )
        default:
          return Editor ? (
            <Editor value={value} onChange={run} isEditing={_isEditing} />
          ) : null
      }
    }
    const Editor = getEditor()
    return (
      <div
        ref={editorRef}
        onClick={() => setIsEditing(true)}
        className={cn("flex h-full w-full overflow-hidden", className, {
          "hover:bg-secondary": !_isEditing,
        })}
      >
        {Editor}
      </div>
    )
  }
)

CellEditor.displayName = "CellEditor"
