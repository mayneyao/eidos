import {
  EIDOS_FILE_FORMULA_FUNCTION_NAMES,
  type EidosFileFieldInfo,
} from "@eidos.space/eidos-file"
import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete"

export type EidosFileFormulaCompletionKind = "field" | "function" | "syntax"

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
  abs: {
    info: "SQLite absolute value for an Integer or Number.",
    example: 'ABS("Balance")',
  },
  ceil: {
    info: "SQLite ceiling of an Integer or Number.",
    example: 'CEIL("Estimate")',
  },
  ceiling: {
    info: "Alias of SQLite CEIL.",
    example: 'CEILING("Estimate")',
  },
  char: {
    info: "Builds text from one or more Unicode code points.",
    example: "CHAR(65, 66)",
  },
  coalesce: {
    info: "Returns the first non-null value.",
    example: 'COALESCE("Nickname", "Name")',
  },
  concat: {
    info: "Converts values to text, skips nulls, and concatenates them.",
    example: "CONCAT(\"Count\", ' items')",
  },
  concat_ws: {
    info: "Concatenates non-null values with a separator.",
    example: 'CONCAT_WS(\' · \', "Project", "Owner")',
  },
  date: {
    info: "Returns a SQLite calendar date using literal safe modifiers.",
    example: "DATE(\"Due\", '+7 days')",
  },
  datetime: {
    info: "Returns a SQLite UTC date-time using literal safe modifiers.",
    example: "DATETIME(\"Starts\", '+1 hour')",
  },
  floor: {
    info: "SQLite floor of an Integer or Number.",
    example: 'FLOOR("Estimate")',
  },
  format: {
    info: "Formats values with SQLite printf formatting rules.",
    example: "FORMAT('%d hours', \"Hours\")",
  },
  ifnull: {
    info: "Returns the first value unless it is null.",
    example: 'IFNULL("Nickname", "Name")',
  },
  iif: {
    info: "Returns one of two same-typed values based on a condition.",
    example: "IIF(\"Done\", 'Done', 'Open')",
  },
  instr: {
    info: "Returns the one-based position of text inside text.",
    example: "INSTR(\"Name\", 'Smith')",
  },
  length: {
    info: "Returns SQLite text length in Unicode code points.",
    example: 'LENGTH("Name")',
  },
  lower: {
    info: "Lowercases ASCII letters using SQLite built-in behavior.",
    example: 'LOWER("Code")',
  },
  max: {
    info: "Returns the SQLite scalar maximum; null propagates.",
    example: 'MAX("Score", 0)',
  },
  min: {
    info: "Returns the SQLite scalar minimum; null propagates.",
    example: 'MIN("Progress", 100)',
  },
  nullif: {
    info: "Returns null when two comparable values are equal.",
    example: "NULLIF(\"Status\", 'Unknown')",
  },
  printf: {
    info: "Alias of SQLite FORMAT.",
    example: "PRINTF('%.2f', \"Amount\")",
  },
  replace: {
    info: "Replaces every matching text occurrence.",
    example: "REPLACE(\"Name\", '-', ' ')",
  },
  round: {
    info: "Rounds a numeric value with optional decimal precision.",
    example: 'ROUND("Amount", 2)',
  },
  sign: {
    info: "Returns -1, 0, or 1 for a numeric value.",
    example: 'SIGN("Balance")',
  },
  strftime: {
    info: "Formats a date-time with a literal SQLite format.",
    example: "STRFTIME('%Y-%m', \"Created\")",
  },
  substr: {
    info: "Returns a one-based SQLite substring; negative values are supported.",
    example: 'SUBSTR("Name", 1, 8)',
  },
  substring: {
    info: "Alias of SQLite SUBSTR.",
    example: 'SUBSTRING("Name", 1, 8)',
  },
  trim: {
    info: "Trims spaces or a supplied character set from both ends.",
    example: 'TRIM("Name")',
  },
  typeof: {
    info: "Returns the SQLite storage class name for a value.",
    example: 'TYPEOF("Amount")',
  },
  unicode: {
    info: "Returns the Unicode code point of the first character.",
    example: 'UNICODE("Name")',
  },
  unixepoch: {
    info: "Returns Unix seconds for a date or date-time.",
    example: 'UNIXEPOCH("Created")',
  },
  upper: {
    info: "Uppercases ASCII letters using SQLite built-in behavior.",
    example: 'UPPER("Code")',
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
  const syntaxCompletions: EidosFileFormulaCompletion[] = [
    {
      id: "syntax:cast",
      kind: "syntax",
      label: "CAST",
      type: "keyword",
      detail: "SQLite expression",
      info: "Converts a scalar to TEXT, INTEGER, or REAL.",
      example: 'CAST("Count" AS TEXT)',
      insert: "CAST( AS TEXT)",
      cursorOffset: -9,
    },
    {
      id: "syntax:case",
      kind: "syntax",
      label: "CASE",
      type: "keyword",
      detail: "SQLite expression",
      info: "Selects a same-typed result with searched CASE WHEN branches.",
      example: "CASE WHEN \"Done\" THEN 'Done' ELSE 'Open' END",
      insert: "CASE WHEN  THEN  ELSE  END",
      cursorOffset: -16,
    },
    {
      id: "syntax:is-null",
      kind: "syntax",
      label: "IS NULL",
      type: "keyword",
      detail: "SQLite expression",
      info: "Tests whether a scalar value is null.",
      example: '"Estimate" IS NULL',
      insert: "IS NULL",
    },
    {
      id: "syntax:is-not-null",
      kind: "syntax",
      label: "IS NOT NULL",
      type: "keyword",
      detail: "SQLite expression",
      info: "Tests whether a scalar value is not null.",
      example: '"Estimate" IS NOT NULL',
      insert: "IS NOT NULL",
    },
  ]
  const coreFunctionCompletions =
    EIDOS_FILE_FORMULA_FUNCTION_NAMES.map<EidosFileFormulaCompletion>(
      (name) => {
        const label = name.toUpperCase()
        const detail = FUNCTION_DETAILS[name] ?? {
          info: `SQLite ${label} scalar function in the Eidos Formula profile.`,
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
    ...syntaxCompletions,
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
