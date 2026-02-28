import { useCurrentUiColumns } from "@/apps/web-app/hooks/use-ui-columns"
import type { IField } from "@/packages/core/types/IField"
import type { FormulaProperty } from "@/packages/core/fields/formula"
import { transformFormula2VirtualGeneratedField } from "@/packages/core/sqlite/sql-formula-parser"

export function useFormulaValidation() {
  const { uiColumns } = useCurrentUiColumns()

  const validateFormula = (
    formula: string,
    currentField: IField<FormulaProperty> | null
  ): { isValid: boolean; error: string | null; result: string | null } => {
    if (!formula || formula.trim() === "") {
      return { isValid: false, error: "Formula cannot be empty", result: null }
    }

    if (!currentField) {
      return {
        isValid: false,
        error: "No current field selected",
        result: null,
      }
    }

    try {
      const otherFields = uiColumns.filter(
        (c) => c.table_column_name !== currentField.table_column_name
      )

      const result = transformFormula2VirtualGeneratedField(
        currentField.table_column_name,
        [
          ...otherFields,
          {
            ...currentField,
            property: { ...currentField.property, formula },
          },
        ]
      )

      if (!result || result.trim() === "") {
        return {
          isValid: false,
          error: "Invalid formula structure",
          result: null,
        }
      }

      return { isValid: true, error: null, result }
    } catch (err) {
      console.error(err)
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Unknown error during formula validation"

      return { isValid: false, error: errorMessage, result: null }
    }
  }

  return validateFormula
}
