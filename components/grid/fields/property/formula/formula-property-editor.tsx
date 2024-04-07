import { useState } from "react"

import { FieldType } from "@/lib/fields/const"
import { FormulaProperty } from "@/lib/fields/formula"
import { IField } from "@/lib/store/interface"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import FormulaEditor from "@/components/formula-editor"

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
      <div className="flex flex-col gap-2">
        <FormulaEditor
          value={input}
          onChange={setInput}
          language="javascript"
        />
        {/* <Input value={input} onChange={(e) => setInput(e.target.value)} /> */}
        <div className="flex items-center justify-between">
          <Label>Display as</Label>
          <Select
            value={displayType}
            onValueChange={(value) => setDisplayType(value as any)}
          >
            <SelectTrigger className="click-outside-ignore w-[200px]">
              <SelectValue placeholder="display as" />
            </SelectTrigger>
            <SelectContent className="click-outside-ignore">
              <SelectItem value={FieldType.Text}>Text</SelectItem>
              <SelectItem value={FieldType.URL}>URL</SelectItem>
              <SelectItem value={FieldType.File}>Files</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
