import {
  astMapper,
  parseFirst,
  toSql,
  type ExprRef,
  type SelectFromStatement,
} from "pgsql-ast-parser"

import { EidosFileError } from "./errors"
import type { EidosFileFieldInfo } from "./types"

export interface CompiledEidosFileFormula {
  field: EidosFileFieldInfo
  expression: string
  dependencies: string[]
}

const ALLOWED_FORMULA_FUNCTIONS = new Set([
  "abs",
  "coalesce",
  "date",
  "datetime",
  "ifnull",
  "iif",
  "julianday",
  "length",
  "lower",
  "ltrim",
  "max",
  "min",
  "nullif",
  "replace",
  "round",
  "rtrim",
  "strftime",
  "substr",
  "substring",
  "time",
  "trim",
  "typeof",
  "unicode",
  "unixepoch",
  "upper",
])

function assertFormulaAst(statement: SelectFromStatement): void {
  let nodeCount = 0
  let selectCount = 0
  let maximumDepth = 0
  const visit = (value: unknown, depth: number): void => {
    if (value === null || typeof value !== "object") return
    maximumDepth = Math.max(maximumDepth, depth)
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1)
      return
    }
    nodeCount += 1
    if ((value as { type?: unknown }).type === "select") selectCount += 1
    for (const child of Object.values(value as Record<string, unknown>)) {
      visit(child, depth + 1)
    }
  }
  visit(statement, 0)
  if (selectCount !== 1) {
    throw new EidosFileError(
      "invalid-schema",
      "Eidos File formulas cannot contain nested queries"
    )
  }
  if (nodeCount > 1_000 || maximumDepth > 50) {
    throw new EidosFileError(
      "invalid-schema",
      "Eidos File formula is too complex"
    )
  }
}

function formulaText(field: EidosFileFieldInfo): string {
  const value = field.property?.formula
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new EidosFileError(
      "invalid-schema",
      `Formula field “${field.name}” requires an expression`
    )
  }
  return value.trim()
}

function assertFormulaText(formula: string): void {
  if (formula.length > 4_000) {
    throw new EidosFileError("invalid-schema", "Eidos File formula is too long")
  }
  if (/;|--|\/\*/.test(formula)) {
    throw new EidosFileError(
      "invalid-schema",
      "Eidos File formulas cannot contain statements or comments"
    )
  }
}

function fieldResolver(fields: EidosFileFieldInfo[]) {
  const rawNames = new Map(
    fields.map((field) => [field.tableColumnName.toLowerCase(), field])
  )
  const displayNames = new Map<string, EidosFileFieldInfo | null>()
  for (const field of fields) {
    const name = field.name.toLowerCase()
    const existing = displayNames.get(name)
    displayNames.set(name, existing && existing !== field ? null : field)
  }
  return (name: string): EidosFileFieldInfo => {
    const key = name.toLowerCase()
    const field = rawNames.get(key) ?? displayNames.get(key)
    if (!field) {
      throw new EidosFileError(
        "field-not-found",
        displayNames.has(key)
          ? `Formula field name is ambiguous: ${name}`
          : `Formula field not found: ${name}`
      )
    }
    return field
  }
}

export function compileEidosFileFormula(
  field: EidosFileFieldInfo,
  fields: EidosFileFieldInfo[]
): CompiledEidosFileFormula {
  const formula = formulaText(field)
  assertFormulaText(formula)
  const resolveField = fieldResolver(fields)
  const dependencies = new Set<string>()
  let statement: SelectFromStatement
  try {
    statement = parseFirst(`SELECT ${formula}`) as SelectFromStatement
  } catch (error) {
    throw new EidosFileError(
      "invalid-schema",
      error instanceof Error
        ? error.message
        : "Unable to parse Eidos File formula"
    )
  }
  if (
    statement.type !== "select" ||
    (statement.from?.length ?? 0) > 0 ||
    statement.columns?.length !== 1
  ) {
    throw new EidosFileError(
      "invalid-schema",
      "An Eidos File formula must be one expression without a FROM clause"
    )
  }
  assertFormulaAst(statement)

  const resolveReference = (name: string) => {
    const dependency = resolveField(name)
    dependencies.add(dependency.tableColumnName)
    return { type: "ref" as const, name: dependency.tableColumnName }
  }
  const mapper = astMapper((map) => ({
    expr: (expression) => {
      if (
        expression?.type === "call" &&
        (expression.function.name.toLowerCase() === "prop" ||
          expression.function.name.toLowerCase() === "props")
      ) {
        const argument = expression.args[0]
        if (
          !argument ||
          !("name" in argument) ||
          typeof argument.name !== "string"
        ) {
          throw new EidosFileError(
            "invalid-schema",
            'prop() requires a field name, for example prop("Due date")'
          )
        }
        return resolveReference(argument.name)
      }
      if (expression?.type === "call") {
        const functionName = expression.function.name.toLowerCase()
        if (!ALLOWED_FORMULA_FUNCTIONS.has(functionName)) {
          throw new EidosFileError(
            "invalid-schema",
            `Unsupported Eidos File formula function: ${functionName}`
          )
        }
      }
      return map.super().expr(expression)
    },
    ref: (reference: ExprRef) => {
      if (reference.name === "*") {
        throw new EidosFileError(
          "invalid-schema",
          "Formula fields cannot use *"
        )
      }
      return resolveReference(reference.name)
    },
  }))
  let modified: SelectFromStatement
  try {
    modified = mapper.statement(statement) as SelectFromStatement
  } catch (error) {
    if (error instanceof EidosFileError) throw error
    throw new EidosFileError(
      "invalid-schema",
      error instanceof Error
        ? error.message
        : "Unable to compile Eidos File formula"
    )
  }
  const expression = modified.columns?.[0]?.expr
  if (!expression) {
    throw new EidosFileError(
      "invalid-schema",
      "Eidos File formula has no expression"
    )
  }
  return {
    field,
    expression: toSql.expr(expression),
    dependencies: [...dependencies],
  }
}

export function compileEidosFileFormulaFields(
  fields: EidosFileFieldInfo[]
): CompiledEidosFileFormula[] {
  const formulaFields = fields.filter(
    (field) =>
      field.type === "formula" &&
      field.valueKind === "derived" &&
      field.isDerived
  )
  const compiled = new Map(
    formulaFields.map((field) => {
      const result = compileEidosFileFormula(field, fields)
      return [field.tableColumnName, result]
    })
  )
  const ordered: CompiledEidosFileFormula[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (columnName: string, path: string[]) => {
    if (visited.has(columnName)) return
    if (visiting.has(columnName)) {
      const cycle = [...path.slice(path.indexOf(columnName)), columnName]
        .map((column) => compiled.get(column)?.field.name ?? column)
        .join(" → ")
      throw new EidosFileError(
        "invalid-schema",
        `Circular Eidos File formula dependency: ${cycle}`
      )
    }
    const formula = compiled.get(columnName)
    if (!formula) return
    visiting.add(columnName)
    for (const dependency of formula.dependencies) {
      if (compiled.has(dependency)) visit(dependency, [...path, columnName])
    }
    visiting.delete(columnName)
    visited.add(columnName)
    ordered.push(formula)
  }
  for (const columnName of compiled.keys()) visit(columnName, [])
  return ordered
}
