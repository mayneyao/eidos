import { useState } from "react"

import { FormulaProperty } from "@/lib/fields/formula"
import { IUIColumn } from "@/hooks/use-table"
import { useCurrentUiColumns } from "@/hooks/use-ui-columns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface IFieldPropertyEditorProps {
  uiColumn: IUIColumn
  onPropertyChange: (property: any) => void
}

export const LinkPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const { formula = "upper(title)" } =
    props.uiColumn.property ?? ({} as FormulaProperty)
  const { nameRawIdMap, rawIdNameMap } = useCurrentUiColumns()
  const [input, setInput] = useState()

  const handleUpdate = () => {
    props.onPropertyChange({
      formula: "",
    })
  }
  return (
    <div className="flex flex-col gap-2 p-2">
      <Button onClick={handleUpdate}>Update</Button>
      <hr />
      <p>
        the formula is based on sqlite core functions, see more at{" "}
        <a href="https://www.sqlite.org/lang_corefunc.html" target="_blank">
          sqlite.org
        </a>
      </p>
      <p>
        the difference is that you can use <code>props("name")</code> to get the
        value of a field but not a column name except <code>title</code> field
      </p>
    </div>
  )
}
