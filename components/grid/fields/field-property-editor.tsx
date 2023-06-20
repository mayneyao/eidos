import React from "react"
import { useClickAway } from "ahooks"

import { IUIColumn } from "@/hooks/use-table"

import { useTableAppStore } from "../store"
import { SelectPropertyEditor } from "./property/select-property-editor"

const PropertyEditorTypeMap: {
  [type: string]: React.FC<{
    uiColumn: IUIColumn
    onPropertyChange: (uiColumn: IUIColumn) => void
  }>
} = {
  select: SelectPropertyEditor,
}

const NotImplementEditor = () => {
  return <div>Not implement</div>
}

interface IFieldPropertyEditorProps {
  updateFieldProperty: (fieldName: string, property: any) => void
}

export const FieldPropertyEditor = ({
  updateFieldProperty,
}: IFieldPropertyEditorProps) => {
  const ref = React.useRef<HTMLDivElement>(null)
  const {
    setIsFieldPropertiesEditorOpen,
    currentUiColumn: currentField,
    setCurrentUiColumn: setCurrentField,
  } = useTableAppStore()
  useClickAway(() => {
    setIsFieldPropertiesEditorOpen(false)
  }, [ref])

  const onPropertyChange = (property: any) => {
    currentField &&
      updateFieldProperty(currentField?.table_column_name, property)
  }

  const Editor =
    PropertyEditorTypeMap[currentField?.type ?? "select"] ?? NotImplementEditor
  return (
    <div
      className="absolute right-0 top-0 h-full w-[400px] bg-slate-50"
      ref={ref}
    >
      <Editor uiColumn={currentField!} onPropertyChange={onPropertyChange} />
    </div>
  )
}
