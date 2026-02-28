import { useState } from "react"
import { useCurrentUiColumns } from "@/apps/web-app/hooks/use-ui-columns"
import type { IField } from "@/packages/core/types/IField"
import type { FormulaProperty } from "@/packages/core/fields/formula"
import { transformFormula2VirtualGeneratedField } from "@/packages/core/sqlite/sql-formula-parser"
import type { FieldType } from "@/packages/core/fields/const"

export function useFormulaUpdate(
  uiColumn: IField<FormulaProperty> | null,
  onPropertyChange: (property: FormulaProperty) => void
) {
  const { uiColumns } = useCurrentUiColumns()
  const [error, setError] = useState<string | null>(null)
  const [rawFormula, setRawFormula] = useState<string | null>(null)

  const updateFormula = (input: string, displayType?: FieldType): boolean => {
    setError(null)
    if (!uiColumn) {
      return false
    }
    const otherFields = uiColumns.filter(
      (c) => c.table_column_name !== uiColumn.table_column_name
    )
    try {
      const transformedFormula = transformFormula2VirtualGeneratedField(
        uiColumn.table_column_name,
        [
          ...otherFields,
          {
            ...uiColumn,
            property: { ...uiColumn.property, formula: input },
          },
        ]
      )
      if (!transformedFormula || transformedFormula.trim() === "") {
        setError("Formula cannot be empty")
        return false
      }
      setRawFormula(transformedFormula)
    } catch (err) {
      console.error(err)
      if (err instanceof Error) {
        setError(err.message.slice(0, 100))
      } else {
        setError("Unknown error")
      }
      return false
    }

    onPropertyChange({
      formula: input,
      displayType,
    })
    return true
  }

  return { error, rawFormula, updateFormula }
}
