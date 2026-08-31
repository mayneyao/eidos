import { EidosFileError } from "./errors"
import { quoteIdentifier } from "./identifiers"
import type { EidosFileConnection } from "./connection"
import type { EidosFileFieldInfo } from "./types"

export interface EidosFileFormulaReference {
  fieldName: string
  start: number
  end: number
}

export interface CompiledEidosFileFormula {
  field: EidosFileFieldInfo
  expression: string
  /** Physical/logical projection aliases retained for query planning. */
  dependencies: string[]
  /** Stable structural dependencies used by the file-wide DAG. */
  dependencyFieldIds: string[]
  references: EidosFileFormulaReference[]
}

/** Eidos File 1.0 has no prop()/props() reference syntax. */
export const EIDOS_FILE_FORMULA_FIELD_FUNCTION_NAMES = [] as const

export const EIDOS_FILE_FORMULA_PROFILE = "sqlite-3.45" as const

export const EIDOS_FILE_FORMULA_FUNCTION_NAMES = [
  "abs",
  "ceil",
  "ceiling",
  "char",
  "coalesce",
  "concat",
  "concat_ws",
  "date",
  "datetime",
  "floor",
  "format",
  "glob",
  "hex",
  "ifnull",
  "iif",
  "instr",
  "julianday",
  "length",
  "like",
  "lower",
  "ltrim",
  "max",
  "min",
  "nullif",
  "octet_length",
  "printf",
  "quote",
  "replace",
  "round",
  "rtrim",
  "sign",
  "strftime",
  "substr",
  "substring",
  "time",
  "timediff",
  "trim",
  "typeof",
  "unicode",
  "unixepoch",
  "upper",
] as const

const ALLOWED_FUNCTIONS = new Set<string>(EIDOS_FILE_FORMULA_FUNCTION_NAMES)
const ALLOWED_KEYWORDS = new Set([
  "and",
  "as",
  "case",
  "cast",
  "else",
  "end",
  "false",
  "integer",
  "is",
  "not",
  "null",
  "or",
  "real",
  "text",
  "then",
  "true",
  "when",
])
const MAX_FORMULA_BYTES = 4_096
const MAX_FORMULA_NODES = 10_000
const MAX_FORMULA_DEPTH = 256

/** Fails fast when a Host SQLite build cannot execute the fixed 1.0 profile. */
export function assertEidosFileFormulaProfile(
  connection: EidosFileConnection
): void {
  try {
    connection.get(`SELECT
      abs(-1), ceil(1.5), ceiling(1.5), char(65), coalesce(NULL, 1),
      concat(1, NULL, 'x'), concat_ws('-', 1, NULL, 2),
      date('2026-01-01'), datetime('2026-01-01'), floor(1.5),
      format('%d', 1), glob('a*', 'abc'), hex('A'), ifnull(NULL, 1),
      iif(1, 1, 0), instr('abc', 'b'), julianday('2026-01-01'),
      length('abc'), like('a%', 'abc'), lower('A'), ltrim(' x'),
      max(1, 2), min(1, 2), nullif(1, 2), octet_length('😀'),
      printf('%d', 1), quote('x'), replace('abc', 'b', 'x'), round(1.5),
      rtrim('x '), sign(-1), strftime('%Y', '2026-01-01'),
      substr('abc', 1, 2), substring('abc', 1, 2),
      time('2026-01-01T12:00:00Z'),
      timediff('2026-01-02', '2026-01-01'), trim(' x '), typeof(1),
      unicode('A'), unixepoch('2026-01-01'), upper('a')`)
  } catch (error) {
    throw new EidosFileError(
      "unsupported-feature",
      `SQLite build does not satisfy the Eidos Formula 1.0 function profile: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

function nextNonWhitespace(source: string, index: number): string | undefined {
  while (index < source.length && /\s/u.test(source[index]!)) index += 1
  return source[index]
}

/**
 * Scans canonical Formula source. Only double-quoted tokens can be Field
 * references; single-quoted string literals are skipped byte-for-byte.
 */
export function eidosFileFormulaReferences(
  source: string
): EidosFileFormulaReference[] {
  if (new TextEncoder().encode(source).byteLength > MAX_FORMULA_BYTES) {
    throw new EidosFileError("resource-limit", "Eidos File formula is too long")
  }
  if (source.trim().length === 0) {
    throw new EidosFileError("invalid-schema", "Formula source cannot be empty")
  }
  const references: EidosFileFormulaReference[] = []
  let index = 0
  while (index < source.length) {
    const character = source[index]!
    if (/\s/u.test(character)) {
      index += 1
      continue
    }
    if (character === "'") {
      index += 1
      let closed = false
      while (index < source.length) {
        if (source[index] !== "'") {
          index += 1
          continue
        }
        if (source[index + 1] === "'") {
          index += 2
          continue
        }
        index += 1
        closed = true
        break
      }
      if (!closed) {
        throw new EidosFileError(
          "invalid-schema",
          "Unterminated string literal"
        )
      }
      continue
    }
    if (character === '"') {
      const start = index
      index += 1
      let name = ""
      let closed = false
      while (index < source.length) {
        if (source[index] !== '"') {
          name += source[index]
          index += 1
          continue
        }
        if (source[index + 1] === '"') {
          name += '"'
          index += 2
          continue
        }
        index += 1
        closed = true
        break
      }
      if (!closed) {
        throw new EidosFileError(
          "invalid-schema",
          "Unterminated Field reference"
        )
      }
      references.push({ fieldName: name, start, end: index })
      continue
    }
    if (/[A-Za-z_]/.test(character)) {
      const start = index
      index += 1
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index]!)) {
        index += 1
      }
      const token = source.slice(start, index).toLowerCase()
      if (nextNonWhitespace(source, index) === "(" && token !== "cast") {
        if (!ALLOWED_FUNCTIONS.has(token)) {
          throw new EidosFileError(
            "invalid-schema",
            `Unsupported Eidos File formula function: ${token}`
          )
        }
      } else if (!ALLOWED_KEYWORDS.has(token)) {
        throw new EidosFileError(
          "invalid-schema",
          `Field references must be double-quoted: ${source.slice(start, index)}`
        )
      }
      continue
    }
    if (/[0-9]/.test(character)) {
      index += 1
      while (index < source.length && /[0-9.eE+-]/.test(source[index]!)) {
        const current = source[index]!
        if (
          (current === "+" || current === "-") &&
          !/[eE]/.test(source[index - 1]!)
        ) {
          break
        }
        index += 1
      }
      continue
    }
    if ("()+-*/%<>=!|,".includes(character)) {
      index += 1
      continue
    }
    throw new EidosFileError(
      "invalid-schema",
      `Unsupported token in Eidos File formula: ${character}`
    )
  }
  return references
}

function formulaText(field: EidosFileFieldInfo): string {
  const value = field.property?.formula
  if (typeof value !== "string") {
    throw new EidosFileError(
      "invalid-schema",
      `Formula Field “${field.name}” requires an expression`
    )
  }
  return value
}

type FormulaStaticType =
  | "text"
  | "number"
  | "integer"
  | "checkbox"
  | "date"
  | "datetime"
  | "url"
  | "json"

interface ExactFormulaNode {
  type: string
  op?: string
  value?: unknown
  name?: string
  left?: ExactFormulaNode
  right?: ExactFormulaNode
  operand?: ExactFormulaNode
  args?: ExactFormulaNode[]
  function?: { name?: string }
  inferred?: FormulaStaticType
  literal?: ExactNumberLiteral
}

interface ExactNumberLiteral {
  raw: string
  type: "integer" | "number"
  sql: string
}

interface ParsedExactFormula {
  root: ExactFormulaNode
  numbers: ExactNumberLiteral[]
}

interface FormulaToken {
  kind:
    | "word"
    | "number"
    | "string"
    | "field"
    | "operator"
    | "left"
    | "right"
    | "comma"
    | "end"
  text: string
  value?: string
  literal?: ExactNumberLiteral
}

function parseExactFormula(source: string): ParsedExactFormula {
  if (new TextEncoder().encode(source).byteLength > MAX_FORMULA_BYTES) {
    throw new EidosFileError("resource-limit", "Eidos File formula is too long")
  }
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= source.length)
        throw new EidosFileError(
          "invalid-formula",
          "Formula source contains an unpaired surrogate"
        )
      const next = source.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff)
        throw new EidosFileError(
          "invalid-formula",
          "Formula source contains an unpaired surrogate"
        )
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new EidosFileError(
        "invalid-formula",
        "Formula source contains an unpaired surrogate"
      )
    }
  }
  const tokens: FormulaToken[] = []
  let index = 0
  while (index < source.length) {
    const character = source[index]!
    if (
      character === " " ||
      character === "\t" ||
      character === "\r" ||
      character === "\n"
    ) {
      index += 1
      continue
    }
    if (character === "'" || character === '"') {
      const quote = character
      index += 1
      let value = ""
      let closed = false
      while (index < source.length) {
        if (source[index] !== quote) {
          value += source[index]
          index += 1
        } else if (source[index + 1] === quote) {
          value += quote
          index += 2
        } else {
          index += 1
          closed = true
          break
        }
      }
      if (!closed)
        throw new EidosFileError(
          "invalid-formula",
          "Unterminated Formula token"
        )
      tokens.push({
        kind: quote === "'" ? "string" : "field",
        text: value,
        value,
      })
      continue
    }
    if (/[0-9]/.test(character)) {
      const match = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(
        source.slice(index)
      )
      if (!match)
        throw new EidosFileError("invalid-formula", "Invalid number literal")
      const raw = match[0]
      const next = source[index + raw.length]
      if (next && /[0-9A-Za-z_.]/.test(next)) {
        throw new EidosFileError(
          "invalid-formula",
          "Invalid number literal boundary"
        )
      }
      const integerToken = !/[.eE]/.test(raw)
      const integer = integerToken ? BigInt(raw) : null
      let literal: ExactNumberLiteral
      if (integer !== null && integer <= 9_223_372_036_854_775_807n) {
        literal = { raw, type: "integer", sql: raw }
      } else {
        const value = Number(raw)
        if (!Number.isFinite(value)) {
          throw new EidosFileError(
            "invalid-formula",
            "Number literal is non-finite"
          )
        }
        let sql = Object.is(value, -0) ? "0.0" : value.toString()
        if (/^-?(?:0|[1-9][0-9]*)$/.test(sql)) sql += ".0"
        literal = { raw, type: "number", sql }
      }
      tokens.push({ kind: "number", text: raw, literal })
      index += raw.length
      continue
    }
    if (/[A-Za-z]/.test(character)) {
      const start = index++
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index]!))
        index += 1
      const token = source.slice(start, index)
      tokens.push({ kind: "word", text: token })
      continue
    }
    if (character === "(") {
      tokens.push({ kind: "left", text: character })
      index += 1
      continue
    }
    if (character === ")") {
      tokens.push({ kind: "right", text: character })
      index += 1
      continue
    }
    if (character === ",") {
      tokens.push({ kind: "comma", text: character })
      index += 1
      continue
    }
    const pair = source.slice(index, index + 2)
    if (["!=", "<=", ">=", "==", "<>", "||"].includes(pair)) {
      tokens.push({ kind: "operator", text: pair })
      index += 2
      continue
    }
    if ("+-*/%<>=|".includes(character)) {
      tokens.push({ kind: "operator", text: character })
      index += 1
      continue
    }
    throw new EidosFileError(
      "invalid-formula",
      `Unsupported token in Eidos File formula: ${character}`
    )
  }
  tokens.push({ kind: "end", text: "" })
  let cursor = 0
  const peek = () => tokens[cursor]!
  const take = () => tokens[cursor++]!
  const word = (value: string) =>
    peek().kind === "word" && peek().text.toUpperCase() === value
  const operator = (...values: string[]) =>
    peek().kind === "operator" && values.includes(peek().text)
  const binary = (
    lower: () => ExactFormulaNode,
    operators: string[]
  ): ExactFormulaNode => {
    let node = lower()
    while (
      (peek().kind === "operator" && operators.includes(peek().text)) ||
      (peek().kind === "word" && operators.includes(peek().text.toUpperCase()))
    ) {
      const op = take().text.toUpperCase()
      node = { type: "binary", op, left: node, right: lower() }
    }
    return node
  }
  let expression: () => ExactFormulaNode
  const primary = (): ExactFormulaNode => {
    const token = take()
    if (token.kind === "number")
      return { type: "number", literal: token.literal }
    if (token.kind === "string") return { type: "string", value: token.value }
    if (token.kind === "field") return { type: "ref", name: token.value }
    if (token.kind === "word") {
      const canonical = token.text.toUpperCase()
      if (canonical === "NULL") return { type: "null" }
      if (canonical === "TRUE" || canonical === "FALSE")
        return { type: "boolean", value: canonical === "TRUE" }
      if (canonical === "CAST") {
        if (take().kind !== "left")
          throw new EidosFileError(
            "invalid-formula",
            "CAST requires an opening parenthesis"
          )
        const operand = expression()
        if (!word("AS"))
          throw new EidosFileError("invalid-formula", "CAST requires AS")
        take()
        const target = take()
        const targetName = target.text.toUpperCase()
        if (
          target.kind !== "word" ||
          !["TEXT", "INTEGER", "REAL"].includes(targetName)
        ) {
          throw new EidosFileError(
            "invalid-formula",
            "CAST target must be TEXT, INTEGER, or REAL"
          )
        }
        if (take().kind !== "right")
          throw new EidosFileError("invalid-formula", "CAST is missing “)”")
        return {
          type: "cast",
          name: targetName.toLowerCase(),
          operand,
        }
      }
      if (canonical === "CASE") {
        const args: ExactFormulaNode[] = []
        while (word("WHEN")) {
          take()
          args.push(expression())
          if (!word("THEN"))
            throw new EidosFileError(
              "invalid-formula",
              "CASE WHEN requires THEN"
            )
          take()
          args.push(expression())
        }
        if (args.length === 0)
          throw new EidosFileError(
            "invalid-formula",
            "CASE requires at least one WHEN"
          )
        let hasElse = false
        if (word("ELSE")) {
          take()
          args.push(expression())
          hasElse = true
        }
        if (!word("END"))
          throw new EidosFileError("invalid-formula", "CASE requires END")
        take()
        return { type: "case", value: hasElse, args }
      }
      if (peek().kind !== "left") {
        throw new EidosFileError(
          "invalid-formula",
          `Field references must be double-quoted: ${token.text}`
        )
      }
      if (!ALLOWED_FUNCTIONS.has(token.text.toLowerCase())) {
        throw new EidosFileError(
          "invalid-formula",
          `Unsupported Formula function: ${token.text}`
        )
      }
      take()
      const args: ExactFormulaNode[] = []
      if (peek().kind !== "right") {
        args.push(expression())
        while (peek().kind === "comma") {
          take()
          args.push(expression())
        }
      }
      if (take().kind !== "right")
        throw new EidosFileError(
          "invalid-formula",
          `Formula function ${token.text} is missing “)”`
        )
      return {
        type: "call",
        function: { name: token.text.toLowerCase() },
        args,
      }
    }
    if (token.kind === "left") {
      const node = expression()
      if (take().kind !== "right")
        throw new EidosFileError("invalid-formula", "Formula is missing “)”")
      return node
    }
    throw new EidosFileError("invalid-formula", "Expected Formula expression")
  }
  const unary = (): ExactFormulaNode => {
    if (operator("+", "-")) {
      const op = take().text
      return { type: "unary", op, operand: primary() }
    }
    return primary()
  }
  const multiplicative = () => binary(unary, ["*", "/", "%"])
  const additive = () => binary(multiplicative, ["+", "-"])
  const concatenation = () => binary(additive, ["||"])
  const comparison = (): ExactFormulaNode => {
    const left = concatenation()
    if (word("IS")) {
      take()
      const negate = word("NOT")
      if (negate) take()
      if (!word("NULL"))
        throw new EidosFileError(
          "invalid-formula",
          "Formula IS only supports IS NULL and IS NOT NULL"
        )
      take()
      return {
        type: "is-null",
        op: negate ? "IS NOT NULL" : "IS NULL",
        operand: left,
      }
    }
    if (!operator("=", "==", "!=", "<>", "<", "<=", ">", ">=")) return left
    const op = take().text
    return { type: "binary", op, left, right: concatenation() }
  }
  const notExpression = (): ExactFormulaNode =>
    word("NOT")
      ? (take(), { type: "unary", op: "NOT", operand: comparison() })
      : comparison()
  const andExpression = () => binary(notExpression, ["AND"])
  const orExpression = () => binary(andExpression, ["OR"])
  expression = orExpression
  if (tokens.length === 1)
    throw new EidosFileError(
      "invalid-formula",
      "Formula source cannot be empty"
    )
  const root = expression()
  if (peek().kind !== "end")
    throw new EidosFileError(
      "invalid-formula",
      `Unexpected Formula token: ${peek().text}`
    )
  assertExactFormulaAst(root)
  return { root, numbers: [] }
}

function assertExactFormulaAst(root: ExactFormulaNode): void {
  let nodes = 0
  let maximumDepth = 0
  const visit = (node: ExactFormulaNode, depth: number): void => {
    nodes += 1
    maximumDepth = Math.max(maximumDepth, depth)
    if (node.left) visit(node.left, depth + 1)
    if (node.right) visit(node.right, depth + 1)
    if (node.operand) visit(node.operand, depth + 1)
    for (const argument of node.args ?? []) visit(argument, depth + 1)
  }
  visit(root, 1)
  if (nodes > MAX_FORMULA_NODES || maximumDepth > MAX_FORMULA_DEPTH) {
    throw new EidosFileError(
      "resource-limit",
      "Eidos File formula exceeds the AST complexity limit"
    )
  }
}

function formulaOperandType(field: EidosFileFieldInfo): FormulaStaticType {
  let type: unknown
  if (field.systemRole === "row-id" || field.type === "row-id") type = "text"
  else if (field.type === "rating") type = "integer"
  else if (
    field.systemRole === "created-time" ||
    field.systemRole === "updated-time" ||
    field.type === "created-time" ||
    field.type === "last-edited-time"
  )
    type = "datetime"
  else if (field.type === "select") type = "text"
  else if (field.type === "lookup" && field.property?.aggregate === "values") {
    type = undefined
  } else if (field.type === "formula" || field.type === "lookup") {
    const valueType = field.property?.valueType
    type =
      valueType === "row-id" || valueType === "select"
        ? "text"
        : typeof valueType === "string"
          ? valueType
          : field.property?.displayType
  } else type = field.type
  if (
    ![
      "text",
      "number",
      "integer",
      "checkbox",
      "date",
      "datetime",
      "url",
      "json",
    ].includes(String(type))
  ) {
    throw new EidosFileError(
      "invalid-schema",
      `Field “${field.name}” is not a Formula scalar operand`
    )
  }
  return type as FormulaStaticType
}

function exactFormulaType(
  node: ExactFormulaNode,
  fields: Map<string, EidosFileFieldInfo>,
  numbers: ExactNumberLiteral[],
  expected?: FormulaStaticType | "any"
): FormulaStaticType | null {
  const infer = (child: ExactFormulaNode, type?: FormulaStaticType | "any") =>
    exactFormulaType(child, fields, numbers, type)
  if (node.literal) return setFormulaType(node, node.literal.type)
  if (node.type === "null")
    return expected === "any" ? null : (expected ?? null)
  if (node.type === "boolean") return setFormulaType(node, "checkbox")
  if (node.type === "string") return setFormulaType(node, "text")
  if (node.type === "ref") {
    const field = fields.get(String(node.name))
    if (!field)
      throw new EidosFileError(
        "field-not-found",
        `Formula Field not found: ${node.name}`
      )
    return setFormulaType(node, formulaOperandType(field))
  }
  if (
    node.type === "call" &&
    String(node.function?.name).startsWith("eidos_literal_")
  ) {
    const literalIndex = Number(
      String(node.function?.name).slice("eidos_literal_".length)
    )
    const literal = numbers[literalIndex]
    if (!literal)
      throw new EidosFileError(
        "invalid-schema",
        "Invalid Formula number literal"
      )
    node.literal = literal
    return setFormulaType(node, literal.type)
  }
  if (node.type === "cast") {
    if (!node.operand)
      throw new EidosFileError("invalid-schema", "CAST requires an operand")
    infer(node.operand, "any")
    const result = {
      text: "text",
      integer: "integer",
      real: "number",
    }[String(node.name)] as FormulaStaticType | undefined
    if (!result)
      throw new EidosFileError("invalid-schema", "Invalid CAST target")
    return setFormulaType(node, result)
  }
  if (node.type === "is-null") {
    if (!node.operand)
      throw new EidosFileError("invalid-schema", "IS NULL requires an operand")
    infer(node.operand, "any")
    return setFormulaType(node, "checkbox")
  }
  if (node.type === "case") {
    const args = node.args ?? []
    const hasElse = node.value === true
    const branchNodes: ExactFormulaNode[] = []
    const pairLength = hasElse ? args.length - 1 : args.length
    for (let index = 0; index < pairLength; index += 2) {
      requireFormulaType(infer(args[index]!, "checkbox"), "checkbox", "CASE")
      branchNodes.push(args[index + 1]!)
    }
    if (hasElse) branchNodes.push(args[args.length - 1]!)
    else branchNodes.push({ type: "null" })
    const result = inferFormulaSequence(branchNodes, fields, numbers, expected)
    return setFormulaType(node, result)
  }
  if (node.type === "unary") {
    if (!node.operand || !["+", "-", "NOT"].includes(String(node.op))) {
      throw new EidosFileError(
        "invalid-schema",
        "Invalid unary Formula operator"
      )
    }
    if (node.op === "NOT") {
      requireFormulaType(infer(node.operand, "checkbox"), "checkbox", "NOT")
      return setFormulaType(node, "checkbox")
    }
    const specialMinimum =
      node.op === "-" && node.operand.literal?.raw === "9223372036854775808"
    if (specialMinimum) {
      node.literal = {
        raw: "-9223372036854775808",
        type: "integer",
        sql: "-9223372036854775808",
      }
      return setFormulaType(node, "integer")
    }
    const operand = infer(node.operand, expected)
    if (operand !== "integer" && operand !== "number") {
      throw new EidosFileError(
        "invalid-schema",
        "Unary sign requires a numeric operand"
      )
    }
    return setFormulaType(node, operand)
  }
  if (node.type === "binary") {
    if (!node.left || !node.right)
      throw new EidosFileError("invalid-schema", "Invalid binary Formula")
    const op = String(node.op).toUpperCase()
    if (op === "AND" || op === "OR") {
      requireFormulaType(infer(node.left, "checkbox"), "checkbox", op)
      requireFormulaType(infer(node.right, "checkbox"), "checkbox", op)
      return setFormulaType(node, "checkbox")
    }
    if (op === "||") {
      infer(node.left, "any")
      infer(node.right, "any")
      return setFormulaType(node, "text")
    }
    if (["+", "-", "*", "/", "%"].includes(op)) {
      const forced = op === "%" ? "integer" : op === "/" ? "number" : expected
      const pair = inferFormulaPair(
        node.left,
        node.right,
        fields,
        numbers,
        forced
      )
      if (
        !isNumericFormulaType(pair.left) ||
        !isNumericFormulaType(pair.right)
      ) {
        throw new EidosFileError(
          "invalid-schema",
          `${op} requires numeric operands`
        )
      }
      if (op === "%" && (pair.left !== "integer" || pair.right !== "integer")) {
        throw new EidosFileError(
          "invalid-schema",
          "% requires Integer operands"
        )
      }
      const result =
        op === "/" || pair.left === "number" || pair.right === "number"
          ? "number"
          : "integer"
      return setFormulaType(node, result)
    }
    if (["=", "==", "!=", "<>", "<", "<=", ">", ">="].includes(op)) {
      const pair = inferFormulaPair(node.left, node.right, fields, numbers)
      if (
        !pair.left ||
        !pair.right ||
        !formulaTypesComparable(
          pair.left,
          pair.right,
          op === "==" ? "=" : op === "<>" ? "!=" : op
        )
      ) {
        throw new EidosFileError(
          "invalid-schema",
          `${op} operands have incompatible types`
        )
      }
      return setFormulaType(node, "checkbox")
    }
    throw new EidosFileError(
      "invalid-schema",
      `Unsupported Formula operator: ${op}`
    )
  }
  if (node.type === "call") {
    const name = String(node.function?.name).toLowerCase()
    const args = node.args ?? []
    const arity = (minimum: number, maximum = minimum) => {
      if (args.length < minimum || args.length > maximum) {
        throw new EidosFileError(
          "invalid-schema",
          `${name} expects ${minimum === maximum ? minimum : `${minimum}–${maximum}`} arguments`
        )
      }
    }
    if (name === "iif") {
      arity(3)
      requireFormulaType(infer(args[0]!, "checkbox"), "checkbox", "IIF")
      const pair = inferFormulaPair(
        args[1]!,
        args[2]!,
        fields,
        numbers,
        expected
      )
      if (!pair.left || !pair.right || pair.left !== pair.right) {
        throw new EidosFileError(
          "invalid-schema",
          "IIF branches require one exact type"
        )
      }
      return setFormulaType(node, pair.left)
    }
    if (name === "coalesce" || name === "ifnull") {
      if (name === "ifnull") arity(2)
      else arity(2, 16)
      const type = inferFormulaSequence(args, fields, numbers, expected)
      return setFormulaType(node, type)
    }
    if (name === "nullif") {
      arity(2)
      const pair = inferFormulaPair(
        args[0]!,
        args[1]!,
        fields,
        numbers,
        expected
      )
      if (
        !pair.left ||
        !pair.right ||
        !formulaTypesComparable(pair.left, pair.right, "=")
      ) {
        throw new EidosFileError(
          "invalid-schema",
          "NULLIF arguments have incompatible types"
        )
      }
      return setFormulaType(node, pair.left)
    }
    if (["abs", "ceil", "ceiling", "floor"].includes(name)) {
      arity(1)
      const type = infer(args[0]!, expected)
      if (!isNumericFormulaType(type))
        throw new EidosFileError(
          "invalid-schema",
          `${name.toUpperCase()} requires numeric input`
        )
      return setFormulaType(node, type)
    }
    if (name === "round") {
      arity(1, 2)
      const type = infer(args[0]!, "number")
      if (!isNumericFormulaType(type))
        throw new EidosFileError(
          "invalid-schema",
          "ROUND requires numeric input"
        )
      if (args[1])
        requireFormulaType(infer(args[1], "integer"), "integer", "ROUND")
      return setFormulaType(node, "number")
    }
    if (name === "sign") {
      arity(1)
      const type = infer(args[0]!, "integer")
      if (!isNumericFormulaType(type))
        throw new EidosFileError(
          "invalid-schema",
          "SIGN requires numeric input"
        )
      return setFormulaType(node, "integer")
    }
    if (name === "min" || name === "max") {
      arity(2, 16)
      const type = inferFormulaSequence(args, fields, numbers, expected)
      if (type === "json")
        throw new EidosFileError(
          "invalid-formula",
          `${name} requires sortable arguments`
        )
      return setFormulaType(node, type)
    }
    if (name === "concat") {
      arity(1, 16)
      for (const argument of args) infer(argument, "any")
      return setFormulaType(node, "text")
    }
    if (name === "concat_ws") {
      arity(2, 16)
      requireFormulaType(infer(args[0]!, "text"), "text", "CONCAT_WS")
      for (const argument of args.slice(1)) infer(argument, "any")
      return setFormulaType(node, "text")
    }
    if (name === "format" || name === "printf") {
      arity(1, 16)
      requireFormulaType(infer(args[0]!, "text"), "text", name)
      for (const argument of args.slice(1)) infer(argument, "any")
      return setFormulaType(node, "text")
    }
    if (name === "char") {
      arity(1, 16)
      for (const argument of args)
        requireFormulaType(infer(argument, "integer"), "integer", "CHAR")
      return setFormulaType(node, "text")
    }
    const fixedSignatures: Record<
      string,
      {
        args: FormulaStaticType[]
        result: FormulaStaticType
        optionalLast?: boolean
      }
    > = {
      glob: { args: ["text", "text"], result: "checkbox" },
      instr: { args: ["text", "text"], result: "integer" },
      length: { args: ["text"], result: "integer" },
      like: {
        args: ["text", "text", "text"],
        result: "checkbox",
        optionalLast: true,
      },
      lower: { args: ["text"], result: "text" },
      ltrim: { args: ["text", "text"], result: "text", optionalLast: true },
      octet_length: { args: ["text"], result: "integer" },
      replace: { args: ["text", "text", "text"], result: "text" },
      rtrim: { args: ["text", "text"], result: "text", optionalLast: true },
      substr: {
        args: ["text", "integer", "integer"],
        result: "text",
        optionalLast: true,
      },
      substring: {
        args: ["text", "integer", "integer"],
        result: "text",
        optionalLast: true,
      },
      trim: { args: ["text", "text"], result: "text", optionalLast: true },
      unicode: { args: ["text"], result: "integer" },
      upper: { args: ["text"], result: "text" },
    }
    const fixedSignature = fixedSignatures[name]
    if (fixedSignature) {
      arity(
        fixedSignature.optionalLast
          ? fixedSignature.args.length - 1
          : fixedSignature.args.length,
        fixedSignature.args.length
      )
      args.forEach((argument, index) =>
        requireFormulaType(
          infer(argument, fixedSignature.args[index]!),
          fixedSignature.args[index]!,
          name
        )
      )
      return setFormulaType(node, fixedSignature.result)
    }
    if (["hex", "quote", "typeof"].includes(name)) {
      arity(1)
      infer(args[0]!, "any")
      return setFormulaType(node, "text")
    }
    if (
      [
        "date",
        "datetime",
        "julianday",
        "strftime",
        "time",
        "timediff",
        "unixepoch",
      ].includes(name)
    ) {
      const timeValue = (argument: ExactFormulaNode): void => {
        if (argument.type === "string") {
          if (String(argument.value).toLowerCase() === "now")
            throw new EidosFileError(
              "invalid-formula",
              `${name.toUpperCase()} does not allow the current-time literal`
            )
          return
        }
        const type = infer(argument, "date")
        if (type !== "date" && type !== "datetime")
          throw new EidosFileError(
            "invalid-schema",
            `${name.toUpperCase()} requires a date or datetime time value`
          )
      }
      const modifier = (argument: ExactFormulaNode): void => {
        if (argument.type !== "string")
          throw new EidosFileError(
            "invalid-formula",
            `${name.toUpperCase()} modifiers must be string literals`
          )
        const value = String(argument.value).toLowerCase()
        if (
          ["localtime", "utc", "auto"].includes(value) ||
          (name === "unixepoch" && ["subsec", "subsecond"].includes(value))
        )
          throw new EidosFileError(
            "invalid-formula",
            `${name.toUpperCase()} modifier is not deterministic`
          )
      }
      if (name === "timediff") {
        arity(2)
        timeValue(args[0]!)
        timeValue(args[1]!)
        return setFormulaType(node, "text")
      }
      const firstTimeValue = name === "strftime" ? 1 : 0
      arity(name === "strftime" ? 2 : 1, 9)
      if (name === "strftime" && args[0]?.type !== "string")
        throw new EidosFileError(
          "invalid-formula",
          "STRFTIME format must be a string literal"
        )
      timeValue(args[firstTimeValue]!)
      for (const argument of args.slice(firstTimeValue + 1)) modifier(argument)
      return setFormulaType(
        node,
        name === "date"
          ? "date"
          : name === "datetime"
            ? "datetime"
            : name === "julianday"
              ? "number"
              : name === "unixepoch"
                ? "integer"
                : "text"
      )
    }
    throw new EidosFileError(
      "invalid-schema",
      `Unsupported Formula function: ${name}`
    )
  }
  throw new EidosFileError(
    "invalid-schema",
    `Unsupported Formula AST node: ${node.type}`
  )
}

function inferFormulaPair(
  leftNode: ExactFormulaNode,
  rightNode: ExactFormulaNode,
  fields: Map<string, EidosFileFieldInfo>,
  numbers: ExactNumberLiteral[],
  expected?: FormulaStaticType | "any"
): { left: FormulaStaticType | null; right: FormulaStaticType | null } {
  let left = exactFormulaType(leftNode, fields, numbers, expected)
  let right = exactFormulaType(rightNode, fields, numbers, left ?? expected)
  if (left === null && right !== null)
    left = exactFormulaType(leftNode, fields, numbers, right)
  if (right === null && left !== null)
    right = exactFormulaType(rightNode, fields, numbers, left)
  return { left, right }
}

function inferFormulaSequence(
  nodes: ExactFormulaNode[],
  fields: Map<string, EidosFileFieldInfo>,
  numbers: ExactNumberLiteral[],
  expected?: FormulaStaticType | "any",
  allowMixedNumeric = false
): FormulaStaticType {
  const types = nodes.map((node) =>
    exactFormulaType(node, fields, numbers, expected)
  )
  let selected = types.find((type): type is FormulaStaticType => type !== null)
  if (!selected && expected && expected !== "any") selected = expected
  if (!selected)
    throw new EidosFileError(
      "invalid-schema",
      "Formula type cannot be inferred from NULL"
    )
  for (let index = 0; index < nodes.length; index += 1) {
    let resolvedType: FormulaStaticType | null = types[index] ?? null
    if (resolvedType === null)
      resolvedType = exactFormulaType(nodes[index]!, fields, numbers, selected)
    if (resolvedType === null)
      throw new EidosFileError(
        "invalid-schema",
        "Formula type cannot be inferred from NULL"
      )
    if (resolvedType === selected) continue
    if (
      allowMixedNumeric &&
      isNumericFormulaType(resolvedType) &&
      isNumericFormulaType(selected)
    ) {
      selected = "number"
      continue
    }
    throw new EidosFileError(
      "invalid-schema",
      "Formula arguments require one exact type"
    )
  }
  return selected
}

function setFormulaType(
  node: ExactFormulaNode,
  type: FormulaStaticType
): FormulaStaticType {
  node.inferred = type
  return type
}

function requireFormulaType(
  actual: FormulaStaticType | null,
  expected: FormulaStaticType,
  operation: string
): void {
  if (actual !== expected)
    throw new EidosFileError(
      "invalid-schema",
      `${operation} requires ${expected}`
    )
}

function isNumericFormulaType(
  type: FormulaStaticType | null
): type is "integer" | "number" {
  return type === "integer" || type === "number"
}

function formulaTypesComparable(
  left: FormulaStaticType,
  right: FormulaStaticType,
  operator: string
): boolean {
  if (isNumericFormulaType(left) && isNumericFormulaType(right)) return true
  if (left !== right) return false
  return operator === "=" || operator === "!=" || left !== "json"
}

function compileExactFormulaNode(
  node: ExactFormulaNode,
  fields: Map<string, EidosFileFieldInfo>,
  resolve: (field: EidosFileFieldInfo) => string
): string {
  const compile = (child: ExactFormulaNode) =>
    compileExactFormulaNode(child, fields, resolve)
  if (node.literal) return node.literal.sql
  if (node.type === "null") return "NULL"
  if (node.type === "boolean") return node.value === true ? "1" : "0"
  if (node.type === "string") {
    const bytes = new TextEncoder().encode(String(node.value))
    const hex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("")
    return `CAST(X'${hex}' AS TEXT)`
  }
  if (node.type === "ref") {
    const field = fields.get(String(node.name))
    if (!field)
      throw new EidosFileError(
        "field-not-found",
        `Formula Field not found: ${node.name}`
      )
    return `(${resolve(field)})`
  }
  if (node.type === "cast")
    return `CAST((${compile(node.operand!)}) AS ${String(node.name).toUpperCase()})`
  if (node.type === "is-null")
    return `((${compile(node.operand!)}) ${String(node.op).toUpperCase()})`
  if (node.type === "case") {
    const args = node.args ?? []
    const hasElse = node.value === true
    const pairLength = hasElse ? args.length - 1 : args.length
    const clauses: string[] = []
    for (let index = 0; index < pairLength; index += 2) {
      clauses.push(
        `WHEN (${compile(args[index]!)}) THEN (${compile(args[index + 1]!)})`
      )
    }
    if (hasElse) clauses.push(`ELSE (${compile(args[args.length - 1]!)})`)
    return `(CASE ${clauses.join(" ")} END)`
  }
  if (node.type === "unary") {
    const operand = compile(node.operand!)
    if (node.op === "NOT") return `(NOT (${operand}))`
    if (node.op === "+") return `(${operand})`
    return node.inferred === "integer"
      ? `eidos_formula_int_neg(${operand})`
      : `eidos_formula_num_neg(${operand})`
  }
  if (node.type === "binary") {
    const left = compile(node.left!)
    const right = compile(node.right!)
    const op = String(node.op).toUpperCase()
    if (op === "AND" || op === "OR") return `((${left}) ${op} (${right}))`
    if (op === "||") return `((${left}) || (${right}))`
    if (["+", "-", "*"].includes(op)) {
      const suffix = op === "+" ? "add" : op === "-" ? "sub" : "mul"
      return `eidos_formula_${node.inferred === "integer" ? "int" : "num"}_${suffix}(${left}, ${right})`
    }
    if (op === "/") return `eidos_formula_num_div(${left}, ${right})`
    if (op === "%") return `eidos_formula_int_mod(${left}, ${right})`
    const normalizedOp = op === "==" ? "=" : op === "<>" ? "!=" : op
    const leftType = node.left!.inferred!
    const rightType = node.right!.inferred!
    if (
      isNumericFormulaType(leftType) &&
      isNumericFormulaType(rightType) &&
      (leftType !== rightType || leftType === "number")
    ) {
      const suffix = {
        "=": "eq",
        "!=": "ne",
        "<": "lt",
        "<=": "lte",
        ">": "gt",
        ">=": "gte",
      }[normalizedOp]
      return `eidos_formula_numeric_${suffix}(${left}, ${right})`
    }
    return `((${left}) COLLATE BINARY ${normalizedOp} (${right}) COLLATE BINARY)`
  }
  if (node.type === "call") {
    const name = String(node.function?.name).toLowerCase()
    const args = (node.args ?? []).map(compile)
    return `${name}(${args.join(", ")})`
  }
  throw new EidosFileError(
    "invalid-schema",
    `Unsupported Formula AST node: ${node.type}`
  )
}

function exactFormulaLiteral(
  node: ExactFormulaNode,
  numbers: ExactNumberLiteral[]
): ExactNumberLiteral | undefined {
  if (node.literal) return node.literal
  if (
    node.type !== "call" ||
    !String(node.function?.name).startsWith("eidos_literal_")
  )
    return undefined
  return numbers[Number(String(node.function?.name).slice(14))]
}

function exactFormulaPrecedence(node: ExactFormulaNode): number {
  if (node.type === "binary") {
    const op = String(node.op).toUpperCase()
    if (op === "OR") return 1
    if (op === "AND") return 2
    if (["=", "==", "!=", "<>", "<", "<=", ">", ">="].includes(op)) return 4
    if (op === "||") return 5
    if (op === "+" || op === "-") return 6
    return 7
  }
  if (node.type === "is-null") return 4
  if (node.type === "unary") return node.op === "NOT" ? 3 : 8
  return 9
}

function serializeExactFormulaNode(
  node: ExactFormulaNode,
  numbers: ExactNumberLiteral[]
): string {
  const literal = exactFormulaLiteral(node, numbers)
  if (literal) return literal.sql
  if (node.type === "null") return "NULL"
  if (node.type === "boolean") return node.value === true ? "TRUE" : "FALSE"
  if (node.type === "string")
    return `'${String(node.value).replace(/'/g, "''")}'`
  if (node.type === "ref") return quoteIdentifier(String(node.name))
  if (node.type === "cast")
    return `CAST(${serializeExactFormulaNode(node.operand!, numbers)} AS ${String(node.name).toUpperCase()})`
  if (node.type === "is-null") {
    const operand = node.operand!
    let serialized = serializeExactFormulaNode(operand, numbers)
    if (exactFormulaPrecedence(operand) < 5) serialized = `(${serialized})`
    return `${serialized} ${String(node.op).toUpperCase()}`
  }
  if (node.type === "case") {
    const args = node.args ?? []
    const hasElse = node.value === true
    const pairLength = hasElse ? args.length - 1 : args.length
    const clauses: string[] = []
    for (let index = 0; index < pairLength; index += 2) {
      clauses.push(
        `WHEN ${serializeExactFormulaNode(args[index]!, numbers)} THEN ${serializeExactFormulaNode(args[index + 1]!, numbers)}`
      )
    }
    if (hasElse)
      clauses.push(
        `ELSE ${serializeExactFormulaNode(args[args.length - 1]!, numbers)}`
      )
    return `CASE ${clauses.join(" ")} END`
  }
  if (node.type === "unary") {
    const operand = node.operand!
    const specialMinimum =
      node.op === "-" &&
      exactFormulaLiteral(operand, numbers)?.raw === "9223372036854775808"
    if (specialMinimum) return "-9223372036854775808"
    let serialized = serializeExactFormulaNode(operand, numbers)
    if (
      exactFormulaPrecedence(operand) < exactFormulaPrecedence(node) ||
      operand.type === "unary"
    )
      serialized = `(${serialized})`
    return `${String(node.op).toUpperCase()}${node.op === "NOT" ? " " : ""}${serialized}`
  }
  if (node.type === "binary") {
    const op = String(node.op).toUpperCase()
    const serializedOp = op === "==" ? "=" : op === "<>" ? "!=" : op
    const precedence = exactFormulaPrecedence(node)
    const comparison = ["=", "==", "!=", "<>", "<", "<=", ">", ">="].includes(
      op
    )
    const child = (value: ExactFormulaNode, right: boolean): string => {
      let serialized = serializeExactFormulaNode(value, numbers)
      const childPrecedence = exactFormulaPrecedence(value)
      if (
        childPrecedence < precedence ||
        (right && childPrecedence === precedence) ||
        (comparison && value.type === "binary" && childPrecedence === 4)
      )
        serialized = `(${serialized})`
      return serialized
    }
    return `${child(node.left!, false)} ${serializedOp} ${child(node.right!, true)}`
  }
  if (node.type === "call") {
    const name = String(node.function?.name).toUpperCase()
    return `${name}(${(node.args ?? [])
      .map((argument) => serializeExactFormulaNode(argument, numbers))
      .join(", ")})`
  }
  throw new EidosFileError(
    "invalid-formula",
    `Unsupported Formula AST node: ${node.type}`
  )
}

function rewriteExactFormulaReferences(
  node: ExactFormulaNode,
  oldFieldName: string,
  newFieldName: string
): void {
  if (node.type === "ref" && node.name === oldFieldName)
    node.name = newFieldName
  if (node.left)
    rewriteExactFormulaReferences(node.left, oldFieldName, newFieldName)
  if (node.right)
    rewriteExactFormulaReferences(node.right, oldFieldName, newFieldName)
  if (node.operand)
    rewriteExactFormulaReferences(node.operand, oldFieldName, newFieldName)
  for (const argument of node.args ?? [])
    rewriteExactFormulaReferences(argument, oldFieldName, newFieldName)
}

/** Compiles canonical source while allowing the Runtime to inline projections. */
export function compileEidosFileFormulaSource(
  source: string,
  fields: EidosFileFieldInfo[],
  resolve: (field: EidosFileFieldInfo) => string,
  declaredResultType?: string
): { expression: string; dependencyFieldIds: string[] } {
  const references = eidosFileFormulaReferences(source)
  const fieldsByExactName = new Map(fields.map((field) => [field.name, field]))
  const dependencyFieldIds: string[] = []
  for (const reference of references) {
    const field = fieldsByExactName.get(reference.fieldName)
    if (!field) {
      throw new EidosFileError(
        "field-not-found",
        `Formula Field not found by exact name: ${reference.fieldName}`
      )
    }
    if (!dependencyFieldIds.includes(field.id))
      dependencyFieldIds.push(field.id)
  }
  const parsed = parseExactFormula(source)
  const expected = declaredResultType as FormulaStaticType | undefined
  const inferred = exactFormulaType(
    parsed.root,
    fieldsByExactName,
    parsed.numbers,
    expected
  )
  if (!inferred || (expected !== undefined && inferred !== expected)) {
    throw new EidosFileError(
      "invalid-schema",
      `Formula inferred ${inferred ?? "no type"}, expected ${expected ?? "a concrete type"}`
    )
  }
  return {
    expression: compileExactFormulaNode(
      parsed.root,
      fieldsByExactName,
      resolve
    ),
    dependencyFieldIds,
  }
}

export function rewriteEidosFileFormulaFieldReferences(
  source: string,
  oldFieldName: string,
  newFieldName: string
): string {
  if (
    !eidosFileFormulaReferences(source).some(
      (reference) => reference.fieldName === oldFieldName
    )
  ) {
    return source
  }
  const parsed = parseExactFormula(source)
  rewriteExactFormulaReferences(parsed.root, oldFieldName, newFieldName)
  return serializeExactFormulaNode(parsed.root, parsed.numbers)
}

export function compileEidosFileFormula(
  field: EidosFileFieldInfo,
  fields: EidosFileFieldInfo[]
): CompiledEidosFileFormula {
  const source = formulaText(field)
  const references = eidosFileFormulaReferences(source)
  const fieldsByExactName = new Map(
    fields.map((candidate) => [candidate.name, candidate])
  )
  const dependencies: string[] = []
  const dependencyFieldIds: string[] = []
  const resolved = new Map<EidosFileFormulaReference, EidosFileFieldInfo>()
  for (const reference of references) {
    const dependency = fieldsByExactName.get(reference.fieldName)
    if (!dependency) {
      throw new EidosFileError(
        "field-not-found",
        `Formula Field not found by exact name: ${reference.fieldName}`
      )
    }
    resolved.set(reference, dependency)
    const projectionName = dependency.physicalName ?? dependency.tableColumnName
    if (!dependencies.includes(projectionName))
      dependencies.push(projectionName)
    const dependencyId = dependency.id
    if (!dependencyFieldIds.includes(dependencyId)) {
      dependencyFieldIds.push(dependencyId)
    }
  }
  const { expression } = compileEidosFileFormulaSource(
    source,
    fields,
    (dependency) =>
      quoteIdentifier(dependency.physicalName ?? dependency.tableColumnName),
    String(field.property?.displayType ?? "text")
  )
  return {
    field,
    expression,
    dependencies,
    dependencyFieldIds,
    references,
  }
}

export function compileEidosFileFormulaFields(
  fields: EidosFileFieldInfo[]
): CompiledEidosFileFormula[] {
  const formulaFields = fields.filter((field) => field.type === "formula")
  const compiled = new Map(
    formulaFields.map((field) => [
      field.id,
      compileEidosFileFormula(field, fields),
    ])
  )
  const ordered: CompiledEidosFileFormula[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (fieldId: string, path: string[]): void => {
    if (visited.has(fieldId)) return
    if (visiting.has(fieldId)) {
      const cycle = [...path.slice(path.indexOf(fieldId)), fieldId]
        .map((id) => compiled.get(id)?.field.name ?? id)
        .join(" → ")
      throw new EidosFileError(
        "dependency-cycle",
        `Circular Eidos File Formula dependency: ${cycle}`
      )
    }
    const formula = compiled.get(fieldId)
    if (!formula) return
    visiting.add(fieldId)
    for (const dependencyId of formula.dependencyFieldIds) {
      if (compiled.has(dependencyId)) visit(dependencyId, [...path, fieldId])
    }
    visiting.delete(fieldId)
    visited.add(fieldId)
    ordered.push(formula)
  }
  for (const fieldId of compiled.keys()) visit(fieldId, [])
  return ordered
}
