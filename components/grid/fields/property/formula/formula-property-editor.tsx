import { useState } from "react"

import { FormulaProperty } from "@/lib/fields/formula"
import { IUIColumn } from "@/hooks/use-table"
import { useCurrentUiColumns } from "@/hooks/use-ui-columns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface IFieldPropertyEditorProps {
  uiColumn: IUIColumn
  onPropertyChange: (property: any) => void
  isCreateNew?: boolean
}

/**
 * upper(f("title")) + f("name")
 * title - cl_xxx1
 * name - cl_xxx2
 * return upper(cl_xxx1) + cl_xxx2
 */
const getTransformedFormula = (formula: string, nameRawIdMap: any) => {
  const regex = /props\("(.+?)"\)/g
  const matches = formula.matchAll(regex)
  let transformedFormula = formula
  for (const match of matches) {
    const [_, name] = match
    const rawId = nameRawIdMap.get(name)
    transformedFormula = transformedFormula.replace(match[0], rawId)
  }
  return transformedFormula
}

/**
 * upper(cl_xxx1) + cl_xxx2
 * title - cl_xxx1
 * name - cl_xxx2
 * return upper(f("title")) + f("name")
 */
const getDisplayFormula = (formula: string, rawIdNameMap: any) => {
  const regex = /(cl_[a-z0-9]{4})/g
  const matches = formula.matchAll(regex)
  let transformedFormula = formula
  for (const match of matches) {
    const [_, rawId] = match
    const name = rawIdNameMap.get(rawId)
    transformedFormula = transformedFormula.replace(
      match[0],
      `props("${name}")`
    )
  }
  return transformedFormula
}

export const FormulaPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const { formula = "upper(title)" } =
    props.uiColumn.property ?? ({} as FormulaProperty)
  const { nameRawIdMap, rawIdNameMap } = useCurrentUiColumns()
  const _formula = getDisplayFormula(formula, rawIdNameMap)
  const [input, setInput] = useState(_formula)

  const handleUpdate = () => {
    const transformedFormula = getTransformedFormula(input, nameRawIdMap)
    props.onPropertyChange({
      formula: transformedFormula,
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
      <p>
        the difference is that you can use <code>props("name")</code> to get the
        value of a field but not a column name except <code>title</code> field
      </p>
    </div>
  )
}
