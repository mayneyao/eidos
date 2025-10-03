import type {
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete"
import type { EditorView } from "codemirror"
import { parse } from "comment-parser"

import { JSON_FUNCTIONS } from "./functions/json"
import { createUdfTooltip } from "./tooltip"

export interface UiColumn {
  name: string
  type?: string
  info?: string
}

export interface Udf {
  id: string
  name: string
  code: string
}

export const getCompletions = (uiColumns: UiColumn[], udfs: Udf[]) => {
  const completions = []

  // Add column name completions
  if (uiColumns && uiColumns.length > 0) {
    uiColumns.forEach((column) => {
      completions.push({
        label: `${column.name}`,
        type: "variable",
        detail: column.type || "column",
        info: column.info,
      })
    })
  }

  // Add custom function completions
  if (udfs && udfs.length > 0) {
    udfs.forEach((udf) => {
      completions.push({
        id: udf.id,
        label: udf.name,
        type: "function",
        detail: "UDF",
        info: (view: EditorView) => createUdfTooltip(udf.code),
        example: extractExampleFromCode(udf.code),
      })
    })
  }

  // Add SQLite core functions based on formula.d.ts
  const sqliteFunctions = [
    // Core functions
    {
      label: "ABS",
      type: "function",
      info: "Returns the absolute value of a number",
      generatedColumnSafe: true,
    },
    {
      label: "CHANGES",
      type: "function",
      info: "Returns the number of database rows that were changed by the most recent SQL statement",
      generatedColumnSafe: false,
    },
    {
      label: "CHAR",
      type: "function",
      info: "Returns a string composed of characters having the given unicode code points",
      generatedColumnSafe: true,
    },
    {
      label: "COALESCE",
      type: "function",
      info: "Returns the first non-NULL value in a list of expressions",
      generatedColumnSafe: true,
    },
    {
      label: "CONCAT",
      type: "function",
      info: "Concatenates strings together",
      generatedColumnSafe: true,
    },
    {
      label: "CONCAT_WS",
      type: "function",
      info: "Concatenates strings with a separator",
      generatedColumnSafe: true,
    },
    {
      label: "FORMAT",
      type: "function",
      info: "Formats a string using printf-style formatting",
      generatedColumnSafe: true,
    },
    {
      label: "GLOB",
      type: "function",
      info: "Pattern matching with wildcards",
      generatedColumnSafe: true,
    },
    {
      label: "HEX",
      type: "function",
      info: "Converts a value to hexadecimal",
      generatedColumnSafe: true,
    },
    {
      label: "IFNULL",
      type: "function",
      info: "Returns the first argument if it is not NULL, otherwise returns the second argument",
      generatedColumnSafe: true,
    },
    {
      label: "IIF",
      type: "function",
      info: "Evaluates a condition and returns one of two values",
      generatedColumnSafe: true,
    },
    {
      label: "INSTR",
      type: "function",
      info: "Returns the position of a substring within a string",
      generatedColumnSafe: true,
    },
    {
      label: "LAST_INSERT_ROWID",
      type: "function",
      info: "Returns the ROWID of the last row inserted",
      generatedColumnSafe: false,
    },
    {
      label: "LENGTH",
      type: "function",
      info: "Returns the length of a string in characters",
      generatedColumnSafe: true,
    },
    {
      label: "LIKE",
      type: "function",
      info: "Pattern matching with wildcards",
      generatedColumnSafe: true,
    },
    {
      label: "LIKELIHOOD",
      type: "function",
      info: "Hint for the query optimizer",
      generatedColumnSafe: false,
    },
    {
      label: "LIKELY",
      type: "function",
      info: "Hint for the query optimizer that the expression is likely to be true",
      generatedColumnSafe: false,
    },
    {
      label: "LOWER",
      type: "function",
      info: "Converts a string to lowercase",
      generatedColumnSafe: true,
    },
    {
      label: "LTRIM",
      type: "function",
      info: "Removes characters from the left side of a string",
      generatedColumnSafe: true,
    },
    {
      label: "MAX",
      type: "function",
      info: "Returns the maximum value of a set of values",
      generatedColumnSafe: false,
    },
    {
      label: "MIN",
      type: "function",
      info: "Returns the minimum value of a set of values",
      generatedColumnSafe: false,
    },
    {
      label: "NULLIF",
      type: "function",
      info: "Returns NULL if the two arguments are equal, otherwise returns the first argument",
      generatedColumnSafe: true,
    },
    {
      label: "OCTET_LENGTH",
      type: "function",
      info: "Returns the length of a string in bytes",
      generatedColumnSafe: true,
    },
    {
      label: "PRINTF",
      type: "function",
      info: "Formats a string using printf-style formatting",
      generatedColumnSafe: true,
    },
    {
      label: "QUOTE",
      type: "function",
      info: "Escapes a string for use in an SQL statement",
      generatedColumnSafe: true,
    },
    {
      label: "RANDOM",
      type: "function",
      info: "Returns a random integer",
      generatedColumnSafe: false,
    },
    {
      label: "RANDOMBLOB",
      type: "function",
      info: "Returns a blob containing random bytes",
      generatedColumnSafe: false,
    },
    {
      label: "REPLACE",
      type: "function",
      info: "Replaces occurrences of a substring within a string",
      generatedColumnSafe: true,
    },
    {
      label: "ROUND",
      type: "function",
      info: "Rounds a number to a specified number of decimal places",
      generatedColumnSafe: true,
    },
    {
      label: "RTRIM",
      type: "function",
      info: "Removes characters from the right side of a string",
      generatedColumnSafe: true,
    },
    {
      label: "SIGN",
      type: "function",
      info: "Returns the sign of a number",
      generatedColumnSafe: true,
    },
    {
      label: "SOUNDEX",
      type: "function",
      info: "Returns a string that is the soundex encoding of the input string",
      generatedColumnSafe: true,
    },
    {
      label: "SUBSTR",
      type: "function",
      info: "Returns a substring of a string",
      generatedColumnSafe: true,
    },
    {
      label: "TRIM",
      type: "function",
      info: "Removes characters from both ends of a string",
      generatedColumnSafe: true,
    },
    {
      label: "UNHEX",
      type: "function",
      info: "Converts a hexadecimal string to a blob",
      generatedColumnSafe: true,
    },
    {
      label: "UNICODE",
      type: "function",
      info: "Returns the unicode code point for the first character of a string",
      generatedColumnSafe: true,
    },
    {
      label: "UNLIKELY",
      type: "function",
      info: "Hint for the query optimizer that the expression is unlikely to be true",
      generatedColumnSafe: false,
    },
    {
      label: "UPPER",
      type: "function",
      info: "Converts a string to uppercase",
      generatedColumnSafe: true,
    },
    {
      label: "ZEROBLOB",
      type: "function",
      info: "Returns a blob consisting of a given number of zero bytes",
      generatedColumnSafe: true,
    },

    // Custom UDFs from formula.d.ts
    {
      label: "PROPS",
      type: "function",
      info: "Returns property value by name",
    },
    {
      label: "TODAY",
      type: "function",
      info: "Returns the current date as a string",
    },

    // JSON functions
    ...Object.entries(JSON_FUNCTIONS).map(([label, info]) => ({
      label,
      type: "function",
      info: info.description,
      example: info.example,
      generatedColumnSafe: true,
    })),
  ]

  // Add common SQL expression operators and keywords
  const sqlOperatorsAndKeywords = [
    // Operators
    { label: "+", type: "operator", info: "Addition" },
    { label: "-", type: "operator", info: "Subtraction" },
    { label: "*", type: "operator", info: "Multiplication" },
    { label: "/", type: "operator", info: "Division" },
    { label: "%", type: "operator", info: "Modulo" },
    { label: "=", type: "operator", info: "Equal to" },
    { label: "<>", type: "operator", info: "Not equal to" },
    { label: ">", type: "operator", info: "Greater than" },
    { label: "<", type: "operator", info: "Less than" },
    { label: ">=", type: "operator", info: "Greater than or equal to" },
    { label: "<=", type: "operator", info: "Less than or equal to" },
    { label: "||", type: "operator", info: "Concatenation" },
    { label: "AND", type: "keyword", info: "Logical AND" },
    { label: "OR", type: "keyword", info: "Logical OR" },
    { label: "NOT", type: "keyword", info: "Logical NOT" },
    { label: "IS NULL", type: "keyword", info: "Check if value is NULL" },
    {
      label: "IS NOT NULL",
      type: "keyword",
      info: "Check if value is not NULL",
    },
    { label: "IN", type: "keyword", info: "Check if value is in a list" },
    {
      label: "BETWEEN",
      type: "keyword",
      info: "Check if value is within a range",
    },

    // Conditional expressions
    { label: "CASE", type: "keyword", info: "Conditional expression" },
    { label: "WHEN", type: "keyword", info: "Case condition" },
    { label: "THEN", type: "keyword", info: "Case result" },
    { label: "ELSE", type: "keyword", info: "Default case result" },
    { label: "END", type: "keyword", info: "End case expression" },

    // Type conversion
    { label: "CAST", type: "function", info: "Convert data type" },
  ]

  // Date functions
  const dateFunctions = [
    {
      label: "DATE",
      type: "function",
      info: "Create date",
      generatedColumnSafe: false,
    },
    {
      label: "DATETIME",
      type: "function",
      info: "Create date and time",
      generatedColumnSafe: false,
    },
    {
      label: "STRFTIME",
      type: "function",
      info: "Format date and time",
      generatedColumnSafe: false,
    },
    {
      label: "DATE_ADD",
      type: "function",
      info: "Add to date",
      generatedColumnSafe: false,
    },
    {
      label: "DATE_SUB",
      type: "function",
      info: "Subtract from date",
      generatedColumnSafe: false,
    },
    {
      label: "JULIANDAY",
      type: "function",
      info: "Get Julian day",
      generatedColumnSafe: false,
    },
  ]

  // Aggregate functions
  const aggregateFunctions = [
    {
      label: "COUNT",
      type: "function",
      info: "Count rows",
      generatedColumnSafe: false,
    },
    {
      label: "SUM",
      type: "function",
      info: "Sum values",
      generatedColumnSafe: false,
    },
    {
      label: "AVG",
      type: "function",
      info: "Average of values",
      generatedColumnSafe: false,
    },
    {
      label: "GROUP_CONCAT",
      type: "function",
      info: "Concatenates values from multiple rows",
      generatedColumnSafe: false,
    },
  ]

  completions.push(
    ...sqliteFunctions.filter((func) => func.generatedColumnSafe),
    ...sqlOperatorsAndKeywords,
    ...dateFunctions.filter((func) => func.generatedColumnSafe),
    ...aggregateFunctions.filter((func) => func.generatedColumnSafe)
  )
  return completions
}

/**
 * Creates SQL expression completions for the formula editor
 */
export function sqlCompletions(
  context: CompletionContext,
  uiColumns: UiColumn[],
  udfs: Udf[]
): CompletionResult | null {
  try {
    const word = context.matchBefore(/\w*/)
    if (!word || (word.from === word.to && !context.explicit)) return null

    const docLength = context.state.doc.length
    if (word.from < 0 || word.to > docLength) {
      console.warn("Completion position outside document bounds", {
        from: word.from,
        to: word.to,
        docLength,
      })
      return null
    }

    const completions = getCompletions(uiColumns, udfs)
    return {
      from: word.from,
      options: completions,
    }
  } catch (error) {
    console.error("Error in SQL completions:", error)
    return null
  }
}

/**
 * Extracts example from UDF code using JSDoc @example tag
 * If no @example tag is found, returns the entire JSDoc content
 * @param code The UDF code to extract example from
 * @returns The example string or undefined if no JSDoc found
 */
function extractExampleFromCode(code: string): string | undefined {
  try {
    // Parse with preserving whitespace option
    const comments = parse(code, {
      // This preserves whitespace in descriptions
      spacing: "preserve",
    })

    if (comments.length > 0) {
      // Get the first JSDoc comment block
      const comment = comments[0]

      // Look for @example tag
      const exampleTag = comment.tags.find((tag) => tag.tag === "example")

      if (exampleTag) {
        // Return the example description with line breaks preserved
        // The source property contains the raw text with original formatting
        return exampleTag.description
          .split("\n")
          .map((line) => line.trim())
          .join("\n")
          .trim()
      }

      // If no @example tag found, return the main description
      return comment.description
        .split("\n")
        .map((line) => line.trim())
        .join("\n")
        .trim()
    }
  } catch (error) {
    console.error("Error parsing JSDoc:", error)
  }

  return undefined
}
