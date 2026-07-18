import {
  EIDOS_FILE_FORMULA_FIELD_FUNCTION_NAMES,
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

const FIELD_FUNCTION_DETAILS: Record<
  (typeof EIDOS_FILE_FORMULA_FIELD_FUNCTION_NAMES)[number],
  { info: string; example: string }
> = {
  prop: {
    info: "Returns a field value by its display name.",
    example: 'PROP("Due date")',
  },
  props: {
    info: "Returns a field value by its display name.",
    example: 'PROPS("Due date")',
  },
}

const FUNCTION_DETAILS: Record<
  (typeof EIDOS_FILE_FORMULA_FUNCTION_NAMES)[number],
  { info: string; example: string }
> = {
  abs: {
    info: "Returns the absolute value of a number.",
    example: "ABS(balance)",
  },
  coalesce: {
    info: "Returns the first value that is not null.",
    example: "COALESCE(nickname, title)",
  },
  date: { info: "Returns a date value.", example: "DATE(due_at)" },
  datetime: {
    info: "Returns a date and time value.",
    example: "DATETIME(created_at)",
  },
  ifnull: {
    info: "Uses a fallback when a value is null.",
    example: "IFNULL(estimate, 0)",
  },
  iif: {
    info: "Returns one of two values based on a condition.",
    example: "IIF(done, 'Done', 'Open')",
  },
  julianday: {
    info: "Returns the Julian day number for a date.",
    example: "JULIANDAY(due) - JULIANDAY(created_at)",
  },
  length: {
    info: "Returns the number of characters in text.",
    example: "LENGTH(title)",
  },
  lower: { info: "Converts text to lowercase.", example: "LOWER(title)" },
  ltrim: {
    info: "Removes characters from the start of text.",
    example: "LTRIM(title)",
  },
  max: {
    info: "Returns the larger of the supplied values.",
    example: "MAX(score, 0)",
  },
  min: {
    info: "Returns the smaller of the supplied values.",
    example: "MIN(progress, 100)",
  },
  nullif: {
    info: "Returns null when two values are equal.",
    example: "NULLIF(status, 'Unknown')",
  },
  replace: {
    info: "Replaces matching text.",
    example: "REPLACE(title, '-', ' ')",
  },
  round: {
    info: "Rounds a number to a chosen precision.",
    example: "ROUND(total, 2)",
  },
  rtrim: {
    info: "Removes characters from the end of text.",
    example: "RTRIM(title)",
  },
  strftime: {
    info: "Formats a date or time value.",
    example: "STRFTIME('%Y-%m', due)",
  },
  substr: {
    info: "Returns part of a text value.",
    example: "SUBSTR(title, 1, 8)",
  },
  substring: {
    info: "Returns part of a text value.",
    example: "SUBSTRING(title, 1, 8)",
  },
  time: { info: "Returns a time value.", example: "TIME(created_at)" },
  trim: {
    info: "Removes characters from both ends of text.",
    example: "TRIM(title)",
  },
  typeof: {
    info: "Returns the SQLite storage type of a value.",
    example: "TYPEOF(estimate)",
  },
  unicode: {
    info: "Returns the Unicode code point of the first character.",
    example: "UNICODE(title)",
  },
  unixepoch: {
    info: "Returns a Unix timestamp for a date or time.",
    example: "UNIXEPOCH(due_at)",
  },
  upper: { info: "Converts text to uppercase.", example: "UPPER(title)" },
}

export function eidosFileFormulaCompletions(
  fields: readonly EidosFileFieldInfo[],
  currentColumnName?: string
): EidosFileFormulaCompletion[] {
  const fieldCompletions = fields
    .filter(
      (field) => !field.isHidden && field.tableColumnName !== currentColumnName
    )
    .map<EidosFileFormulaCompletion>((field) => ({
      id: `field:${field.tableName}:${field.tableColumnName}`,
      kind: "field",
      label: field.name,
      type: "variable",
      detail: `${field.tableColumnName} · ${field.type}`,
      info: `${field.tableColumnName} · ${field.type}`,
      insert: `prop(${JSON.stringify(field.name)})`,
      example: `prop(${JSON.stringify(field.name)})`,
      boost: 100,
    }))
  const fieldFunctionCompletions =
    EIDOS_FILE_FORMULA_FIELD_FUNCTION_NAMES.map<EidosFileFormulaCompletion>(
      (name) => {
        const label = name.toUpperCase()
        const detail = FIELD_FUNCTION_DETAILS[name]
        return {
          id: `function:${name}`,
          kind: "function",
          label,
          type: "function",
          detail: "field reference",
          info: detail.info,
          example: detail.example,
          insert: `${label}()`,
          cursorOffset: -1,
        }
      }
    )
  const coreFunctionCompletions =
    EIDOS_FILE_FORMULA_FUNCTION_NAMES.map<EidosFileFormulaCompletion>(
      (name) => {
        const label = name.toUpperCase()
        const detail = FUNCTION_DETAILS[name]
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
