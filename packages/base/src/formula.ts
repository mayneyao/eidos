import {
  astMapper,
  parseFirst,
  toSql,
  type ExprRef,
  type SelectFromStatement,
} from "pgsql-ast-parser"

import { BaseError } from "./errors"
import type { BaseFieldInfo } from "./types"

export interface CompiledBaseFormula {
  field: BaseFieldInfo
  expression: string
  dependencies: string[]
}

function formulaText(field: BaseFieldInfo): string {
  const value = field.property?.formula
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BaseError(
      "invalid-schema",
      `Formula field “${field.name}” requires an expression`
    )
  }
  return value.trim()
}

function assertFormulaText(formula: string): void {
  if (formula.length > 4_000) {
    throw new BaseError("invalid-schema", "Base formula is too long")
  }
  if (/;|--|\/\*/.test(formula)) {
    throw new BaseError(
      "invalid-schema",
      "Base formulas cannot contain statements or comments"
    )
  }
}

function fieldResolver(fields: BaseFieldInfo[]) {
  const rawNames = new Map(
    fields.map((field) => [field.tableColumnName.toLowerCase(), field])
  )
  const displayNames = new Map<string, BaseFieldInfo | null>()
  for (const field of fields) {
    const name = field.name.toLowerCase()
    const existing = displayNames.get(name)
    displayNames.set(name, existing && existing !== field ? null : field)
  }
  return (name: string): BaseFieldInfo => {
    const key = name.toLowerCase()
    const field = rawNames.get(key) ?? displayNames.get(key)
    if (!field) {
      throw new BaseError(
        "field-not-found",
        displayNames.has(key)
          ? `Formula field name is ambiguous: ${name}`
          : `Formula field not found: ${name}`
      )
    }
    return field
  }
}

export function compileBaseFormula(
  field: BaseFieldInfo,
  fields: BaseFieldInfo[]
): CompiledBaseFormula {
  const storedExpression = field.property?.expression
  const storedDependencies = field.dependsOn
  if (
    typeof storedExpression === "string" &&
    storedExpression.length > 0 &&
    Array.isArray(storedDependencies) &&
    storedDependencies.every((dependency) => typeof dependency === "string")
  ) {
    assertFormulaText(storedExpression)
    return {
      field,
      expression: storedExpression,
      dependencies: storedDependencies,
    }
  }
  const formula = formulaText(field)
  assertFormulaText(formula)
  const resolveField = fieldResolver(fields)
  const dependencies = new Set<string>()
  let statement: SelectFromStatement
  try {
    statement = parseFirst(`SELECT ${formula}`) as SelectFromStatement
  } catch (error) {
    throw new BaseError(
      "invalid-schema",
      error instanceof Error ? error.message : "Unable to parse Base formula"
    )
  }
  if (
    statement.type !== "select" ||
    (statement.from?.length ?? 0) > 0 ||
    statement.columns?.length !== 1
  ) {
    throw new BaseError(
      "invalid-schema",
      "A Base formula must be one expression without a FROM clause"
    )
  }

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
          throw new BaseError(
            "invalid-schema",
            'prop() requires a field name, for example prop("Due date")'
          )
        }
        return resolveReference(argument.name)
      }
      return map.super().expr(expression)
    },
    ref: (reference: ExprRef) => {
      if (reference.name === "*") {
        throw new BaseError("invalid-schema", "Formula fields cannot use *")
      }
      return resolveReference(reference.name)
    },
  }))
  let modified: SelectFromStatement
  try {
    modified = mapper.statement(statement) as SelectFromStatement
  } catch (error) {
    if (error instanceof BaseError) throw error
    throw new BaseError(
      "invalid-schema",
      error instanceof Error ? error.message : "Unable to compile Base formula"
    )
  }
  const expression = modified.columns?.[0]?.expr
  if (!expression) {
    throw new BaseError("invalid-schema", "Base formula has no expression")
  }
  return {
    field,
    expression: toSql.expr(expression),
    dependencies: [...dependencies],
  }
}

export function compileBaseFormulaFields(
  fields: BaseFieldInfo[]
): CompiledBaseFormula[] {
  const formulaFields = fields.filter(
    (field) =>
      field.type === "formula" &&
      field.valueKind === "derived" &&
      field.isDerived
  )
  const compiled = new Map(
    formulaFields.map((field) => {
      const result = compileBaseFormula(field, fields)
      return [field.tableColumnName, result]
    })
  )
  const ordered: CompiledBaseFormula[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (columnName: string, path: string[]) => {
    if (visited.has(columnName)) return
    if (visiting.has(columnName)) {
      const cycle = [...path.slice(path.indexOf(columnName)), columnName]
        .map((column) => compiled.get(column)?.field.name ?? column)
        .join(" → ")
      throw new BaseError(
        "invalid-schema",
        `Circular Base formula dependency: ${cycle}`
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
