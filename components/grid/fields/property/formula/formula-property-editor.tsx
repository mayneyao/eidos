import { useState } from "react"

import { FieldType } from "@/lib/fields/const"
import { FormulaProperty } from "@/lib/fields/formula"
import { IField } from "@/lib/store/interface"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface IFieldPropertyEditorProps {
  uiColumn: IField<FormulaProperty>
  onPropertyChange: (property: FormulaProperty) => void
  isCreateNew?: boolean
}

export const FormulaPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const { formula = "upper(title)" } =
    props.uiColumn.property ?? ({} as FormulaProperty)
  const [input, setInput] = useState(formula)
  const [displayType, setDisplayType] = useState(
    props.uiColumn.property.displayType
  )

  const handleUpdate = () => {
    props.onPropertyChange({
      formula: input,
      displayType,
    })
  }
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2 p-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} />

        <div>Display as</div>
        <select
          value={displayType}
          onChange={(e) => setDisplayType(e.target.value as any)}
        >
          <option value={FieldType.Text}>Text</option>
          <option value={FieldType.URL}>URL</option>
          <option value={FieldType.File}>Files</option>
        </select>
        <hr />
        <p>
          the formula is based on sqlite core functions, see more at{" "}
          <a
            href="https://www.sqlite.org/lang_corefunc.html"
            target="_blank"
            className="text-blue-500"
          >
            sqlite.org
          </a>
        </p>
      </div>

      <Button onClick={handleUpdate}>Update</Button>
    </div>
  )
}
