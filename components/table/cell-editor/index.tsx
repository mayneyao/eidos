import { useState } from "react"

import { FieldType } from "@/lib/fields/const"
import { IField } from "@/lib/store/interface"

import { TextBaseEditor } from "./text-base-editor"

export const CellEditorMap = {
  [FieldType.Checkbox]: null,
  [FieldType.Date]: null,
  [FieldType.Text]: TextBaseEditor,
  [FieldType.Title]: TextBaseEditor,
  [FieldType.URL]: TextBaseEditor,
  [FieldType.Number]: TextBaseEditor,
  [FieldType.Select]: null,
  [FieldType.MultiSelect]: null,
  [FieldType.File]: null,
}

interface ICellEditorProps {
  field: IField
  value: any
  onChange: (value: any) => void
}
export const CellEditor = ({ field, value, onChange }: ICellEditorProps) => {
  if (!field) return null
  switch (field.type) {
    case FieldType.Text:
    case FieldType.Title:
      return <TextBaseEditor type="text" value={value} onChange={onChange} />
    case FieldType.URL:
      return <TextBaseEditor type="url" value={value} onChange={onChange} />
    case FieldType.Number:
      return <TextBaseEditor type="number" value={value} onChange={onChange} />
    default:
      return null
  }
}
