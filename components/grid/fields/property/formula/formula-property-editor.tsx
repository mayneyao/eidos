import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormulaProperty } from "@/lib/fields/formula"
import { IField } from "@/lib/store/interface"

interface IFieldPropertyEditorProps {
  uiColumn: IField
  onPropertyChange: (property: any) => void
  isCreateNew?: boolean
}

export const FormulaPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const { formula = "upper(title)" } =
    props.uiColumn.property ?? ({} as FormulaProperty)
  const [input, setInput] = useState(formula)

  const handleUpdate = () => {
    props.onPropertyChange({
      formula: input,
    })
  }
  return (
    <div className="flex flex-col gap-2 p-2">
      <Input value={input} onChange={(e) => setInput(e.target.value)} />
      <Button onClick={handleUpdate}>Update</Button>
      <hr />
      <p>
        the formula is based on sqlite core functions, see more at{" "}
        <a href="https://www.sqlite.org/lang_corefunc.html" target="_blank">
          sqlite.org
        </a>
      </p>
    </div>
  )
}
