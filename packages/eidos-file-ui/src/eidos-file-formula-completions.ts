import {
  EIDOS_FILE_FORMULA_FUNCTION_NAMES,
  type EidosFileFieldInfo,
} from "@eidos.space/eidos-file"
import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete"

export type EidosFileFormulaCompletionKind = "field" | "function"

export interface EidosFileFormulaCompletion extends Completion {
  id: string
  kind: EidosFileFormulaCompletionKind
  info: string
  insert: string
  cursorOffset?: number
  example?: string
}

function isFormulaScalarField(field: EidosFileFieldInfo): boolean {
  if (["multi-select", "file", "relation"].includes(field.type)) return false
  if (field.type !== "lookup") return true
  if (field.property?.aggregate === "values") return false
  const valueType = field.property?.valueType
  return (
    typeof valueType !== "object" &&
    valueType !== "file-entry" &&
    valueType !== "multi-select" &&
    valueType !== "file" &&
    valueType !== "relation"
  )
}

const FUNCTION_DETAILS: Partial<
  Record<
    (typeof EIDOS_FILE_FORMULA_FUNCTION_NAMES)[number],
    { info: string; example: string }
  >
> = {
  if: {
    info: "Returns the second value for true, otherwise the third value.",
    example: "IF(\"Done\", 'Done', 'Open')",
  },
  abs: {
    info: "Returns the exact Integer or Number absolute value.",
    example: 'ABS("Balance")',
  },
  coalesce: {
    info: "Returns the first value that is not null.",
    example: 'COALESCE("Nickname", "Name")',
  },
  is_null: {
    info: "Tests whether one value is null.",
    example: 'IS_NULL("Estimate")',
  },
  floor: {
    info: "Rounds a Number down to an Integer, or null outside int64.",
    example: 'FLOOR("Estimate")',
  },
  ceil: {
    info: "Rounds a Number up to an Integer, or null outside int64.",
    example: 'CEIL("Estimate")',
  },
  concat: {
    info: "Concatenates 2–16 text values; null propagates.",
    example: 'CONCAT("First name", \' \', "Last name")',
  },
  length: {
    info: "Returns the number of Unicode scalar values in text.",
    example: 'LENGTH("Name")',
  },
  max: {
    info: "Returns the typed maximum of 2–16 sortable values.",
    example: 'MAX("Score", 0)',
  },
  min: {
    info: "Returns the typed minimum of 2–16 sortable values.",
    example: 'MIN("Progress", 100)',
  },
  substr: {
    info: "Returns a zero-based Unicode-scalar slice.",
    example: 'SUBSTR("Name", 0, 8)',
  },
  lower_ascii: {
    info: "Lowercases ASCII letters and leaves other scalars unchanged.",
    example: 'LOWER_ASCII("Code")',
  },
  upper_ascii: {
    info: "Uppercases ASCII letters and leaves other scalars unchanged.",
    example: 'UPPER_ASCII("Code")',
  },
  date_add_days: {
    info: "Adds whole days in the proleptic Gregorian calendar.",
    example: 'DATE_ADD_DAYS("Due", 7)',
  },
  date_diff_days: {
    info: "Returns the exact whole-day difference between two dates.",
    example: 'DATE_DIFF_DAYS("Due", "Start")',
  },
  datetime_add_milliseconds: {
    info: "Adds exact milliseconds to a canonical UTC datetime.",
    example: 'DATETIME_ADD_MILLISECONDS("Updated", 1000)',
  },
  datetime_diff_milliseconds: {
    info: "Returns the exact millisecond difference between UTC datetimes.",
    example: 'DATETIME_DIFF_MILLISECONDS("Updated", "Created")',
  },
}

export function eidosFileFormulaCompletions(
  fields: readonly EidosFileFieldInfo[],
  currentColumnName?: string
): EidosFileFormulaCompletion[] {
  const fieldCompletions = fields
    .filter(
      (field) =>
        !field.isHidden &&
        field.tableColumnName !== currentColumnName &&
        isFormulaScalarField(field)
    )
    .map<EidosFileFormulaCompletion>((field) => ({
      id: `field:${field.tableName}:${field.tableColumnName}`,
      kind: "field",
      label: field.name,
      type: "variable",
      detail: `${field.tableColumnName} · ${field.type}`,
      info: `${field.tableColumnName} · ${field.type}`,
      insert: `"${field.name.replace(/"/g, '""')}"`,
      example: `"${field.name.replace(/"/g, '""')}"`,
      boost: 100,
    }))
  const fieldFunctionCompletions: EidosFileFormulaCompletion[] = []
  const coreFunctionCompletions =
    EIDOS_FILE_FORMULA_FUNCTION_NAMES.map<EidosFileFormulaCompletion>(
      (name) => {
        const label = name.toUpperCase()
        const detail = FUNCTION_DETAILS[name] ?? {
          info: `Eidos File ${name} function.`,
          example: `${label}()`,
        }
        return {
          id: `function:${name}`,
          kind: "function",
          label,
          type: "function",
          detail: "function",
          info: detail.info,
          example: detail.example,
          insert: `${label}()`,
          cursorOffset: -1,
        }
      }
    )
  return [
    ...fieldCompletions,
    ...fieldFunctionCompletions,
    ...coreFunctionCompletions,
  ]
}

export function eidosFileFormulaCompletionSource(
  completions: readonly EidosFileFormulaCompletion[]
) {
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/[\w-]*/)
    if (!word || (word.from === word.to && !context.explicit)) return null
    return {
      from: word.from,
      options: completions.map((completion) => ({
        label: completion.label,
        type: completion.type,
        detail: completion.detail,
        info: completion.info,
        apply: (view, _selected, from, to) => {
          view.dispatch({
            changes: { from, to, insert: completion.insert },
            selection: {
              anchor:
                from +
                completion.insert.length +
                (completion.cursorOffset ?? 0),
            },
          })
        },
      })),
    }
  }
}
