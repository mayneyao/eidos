import { useCallback, useMemo, useRef, useState } from "react"
import { useClickAway, useDebounceFn } from "ahooks"

import { getFieldInstance } from "@/lib/fields"
import { FieldType } from "@/lib/fields/const"
import { FileField } from "@/lib/fields/file"
import { SelectProperty } from "@/lib/fields/select"
import { IField } from "@/lib/store/interface"
import { cn } from "@/lib/utils"
import { FileCell } from "@/components/grid/cells/file/file-cell"

import { CheckboxEditor } from "./checkbox-editor"
import { DateEditor } from "./date-editor"
import { FileEditor } from "./file-editor"
import { MultiSelectEditor } from "./multi-select-editor"
import { RatingEditor } from "./rating-editor"
import { SelectEditor } from "./select-editor"
import { TextBaseEditor } from "./text-base-editor"
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
  [FieldType.Text]: TextBaseEditor,
  [FieldType.Title]: TextBaseEditor,
  [FieldType.URL]: TextBaseEditor,
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
}
export const CellEditor = ({
  field,
  value,
  onChange,
  className,
  editorMode,
  disableTextBaseEditor,
  disabled,
}: ICellEditorProps) => {
  const { run } = useDebounceFn(onChange, { wait: 500 })
  const [isEditing, setIsEditing] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)

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
    switch (field.type) {
      case FieldType.Text:
      case FieldType.Title:
      case FieldType.URL:
        return (
          <TextBaseEditor
            type="text"
            value={value}
            onChange={run}
            isEditing={disableTextBaseEditor ? false : _isEditing}
          />
        )
      case FieldType.Number:
        return (
          <TextBaseEditor
            type="number"
            value={value}
            onChange={run}
            isEditing={disableTextBaseEditor ? false : _isEditing}
          />
        )
      case FieldType.Select:
        return (
          <SelectEditor
            value={value}
            onChange={run}
            options={(field as IField<SelectProperty>).property.options || []}
            isEditing={_isEditing}
          />
        )
      case FieldType.MultiSelect:
        return (
          <MultiSelectEditor
            value={value}
            onChange={run}
            options={(field as IField<SelectProperty>).property.options || []}
            isEditing={_isEditing}
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
          />
        )
      case FieldType.Formula:
        return (
          <TextBaseEditor
            type="text"
            value={value}
            onChange={run}
            isEditing={false}
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
      className={cn("h-full w-full overflow-hidden", className, {
        "hover:bg-secondary": !_isEditing,
      })}
    >
      {Editor}
    </div>
  )
}
