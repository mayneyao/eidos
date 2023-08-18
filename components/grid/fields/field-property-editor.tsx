import React from "react"
import { useClickAway } from "ahooks"

import { IUIColumn } from "@/hooks/use-table"

import { useTableAppStore } from "../store"
import { FormulaPropertyEditor } from "./property/formula/formula-property-editor"
import { SelectPropertyEditor } from "./property/select/select-property-editor"

const PropertyEditorTypeMap: {
  [type: string]: React.FC<{
    uiColumn: IUIColumn
    onPropertyChange: (uiColumn: IUIColumn) => void
  }>
} = {
  select: SelectPropertyEditor,
  "multi-select": SelectPropertyEditor,
  formula: FormulaPropertyEditor,
}

const NotImplementEditor = () => {
  return <div>Not implement</div>
}

interface IFieldPropertyEditorProps {
  updateFieldProperty: (fieldName: IUIColumn, property: any) => void
}

export const FieldPropertyEditor = ({
  updateFieldProperty,
}: IFieldPropertyEditorProps) => {
  const ref = React.useRef<HTMLDivElement>(null)
  const { setIsFieldPropertiesEditorOpen, currentUiColumn: currentField } =
    useTableAppStore()

  useClickAway(
    (e) => {
      setIsFieldPropertiesEditorOpen(false)
    },
    [ref]
  )

  const onPropertyChange = (property: any) => {
    currentField && updateFieldProperty(currentField, property)
  }

  const Editor =
    PropertyEditorTypeMap[currentField?.type ?? "select"] ?? NotImplementEditor
  return (
    <div
      className="absolute right-0 top-0 h-full w-[400px] bg-slate-50 dark:bg-slate-950"
      ref={ref}
    >
      <Editor uiColumn={currentField!} onPropertyChange={onPropertyChange} />
    </div>
  )
}
