import { useRef, useState } from "react"
import { useClickAway, useDebounceFn } from "ahooks"

import { allFieldTypesMap } from "@/lib/fields"
import { FieldType } from "@/lib/fields/const"
import { FileField } from "@/lib/fields/file"
import { SelectField } from "@/lib/fields/select"
import { IField } from "@/lib/store/interface"
import { cn } from "@/lib/utils"
import { FileCell } from "@/components/grid/cells/file/file-cell"

import { CheckboxEditor } from "./checkbox-editor"
import { DateEditor } from "./date-editor"
import { FileEditor } from "./file-editor"
import { RatingEditor } from "./rating-editor"
import { SelectEditor } from "./select-editor"
import { TextBaseEditor } from "./text-base-editor"

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
  [FieldType.MultiSelect]: null,
  [FieldType.File]: FileEditor,
  [FieldType.Rating]: RatingEditor,
  [FieldType.Formula]: null,
  [FieldType.Link]: null,
}

interface ICellEditorProps {
  field: IField
  value: any
  onChange: (value: any) => void
  className?: string
  editorMode?: boolean
}
export const CellEditor = ({
  field,
  value,
  onChange,
  className,
  editorMode,
}: ICellEditorProps) => {
  const { run } = useDebounceFn(onChange, { wait: 500 })
  const [isEditing, setIsEditing] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)

  useClickAway(() => {
    setIsEditing(false)
  }, editorRef)

  if (!field) return null

  const _isEditing = editorMode ? true : isEditing
  const getEditor = () => {
    const Editor = CellEditorMap[field.type]
    switch (field.type) {
      case FieldType.Text:
      case FieldType.Title:
        return (
          <TextBaseEditor
            type="text"
            value={value}
            onChange={run}
            isEditing={_isEditing}
          />
        )
      case FieldType.URL:
        return (
          <TextBaseEditor
            type="text"
            value={value}
            onChange={run}
            isEditing={_isEditing}
          />
        )
      case FieldType.Number:
        return (
          <TextBaseEditor
            type="number"
            value={value}
            onChange={run}
            isEditing={_isEditing}
          />
        )
      case FieldType.Select:
        return (
          <SelectEditor
            value={value}
            onChange={run}
            options={(field as IField<SelectField>).property.options}
            isEditing={_isEditing}
          />
        )
      case FieldType.File:
        const fieldCls = allFieldTypesMap[field.type]
        const fieldInstance = new fieldCls(field) as FileField
        const cell = fieldInstance.getCellContent(value as never) as FileCell
        const onChange = (cell: FileCell) => {
          const value = fieldInstance.cellData2RawData(cell)
          run(value.rawData)
        }
        return (
          <FileEditor
            value={cell}
            onChange={onChange}
            isEditing={_isEditing}
          ></FileEditor>
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
      className={cn("h-full w-full", className, {
        "hover:bg-secondary": !_isEditing,
      })}
    >
      {Editor}
    </div>
  )
}
