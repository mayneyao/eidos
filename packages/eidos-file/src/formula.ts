import { EidosFileError } from "./errors"
import { quoteIdentifier } from "./identifiers"
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

export const EIDOS_FILE_FORMULA_FUNCTION_NAMES = [
  "abs",
  "coalesce",
  "if",
  "is_null",
  "floor",
  "ceil",
  "concat",
  "length",
  "max",
  "min",
  "substr",
  "lower_ascii",
  "upper_ascii",
  "date_add_days",
  "date_diff_days",
  "datetime_add_milliseconds",
  "datetime_diff_milliseconds",
] as const

const ALLOWED_FUNCTIONS = new Set<string>(EIDOS_FILE_FORMULA_FUNCTION_NAMES)
const ALLOWED_KEYWORDS = new Set(["and", "false", "not", "null", "or", "true"])
const MAX_FORMULA_BYTES = 4_096
const MAX_FORMULA_NODES = 10_000
const MAX_FORMULA_DEPTH = 256

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
      if (nextNonWhitespace(source, index) === "(") {
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
    if ("()+-*/%<>=!&,".includes(character)) {
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
    if (["!=", "<=", ">="].includes(pair)) {
      tokens.push({ kind: "operator", text: pair })
      index += 2
      continue
    }
    if ("+-*/%<>=&".includes(character)) {
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
  const concatenation = () => binary(additive, ["&"])
  const comparison = (): ExactFormulaNode => {
    const left = concatenation()
    if (!operator("=", "!=", "<", "<=", ">", ">=")) return left
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
    if (op === "&") {
      requireFormulaType(infer(node.left, "text"), "text", "&")
      requireFormulaType(infer(node.right, "text"), "text", "&")
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
    if (["=", "!=", "<", "<=", ">", ">="].includes(op)) {
      const pair = inferFormulaPair(node.left, node.right, fields, numbers)
      if (
        !pair.left ||
        !pair.right ||
        !formulaTypesComparable(pair.left, pair.right, op)
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
    if (name === "if") {
      arity(3)
      requireFormulaType(infer(args[0]!, "checkbox"), "checkbox", "IF")
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
          "IF branches require one exact type"
        )
      }
      return setFormulaType(node, pair.left)
    }
    if (name === "coalesce") {
      arity(2, 16)
      const type = inferFormulaSequence(args, fields, numbers, expected)
      return setFormulaType(node, type)
    }
    if (name === "is_null") {
      arity(1)
      infer(args[0]!, "any")
      return setFormulaType(node, "checkbox")
    }
    if (name === "abs") {
      arity(1)
      const type = infer(args[0]!, expected)
      if (!isNumericFormulaType(type))
        throw new EidosFileError("invalid-schema", "ABS requires numeric input")
      return setFormulaType(node, type)
    }
    if (name === "min" || name === "max") {
      arity(2, 16)
      const type = inferFormulaSequence(args, fields, numbers, expected, true)
      if (type === "json")
        throw new EidosFileError(
          "invalid-formula",
          `${name} requires sortable arguments`
        )
      return setFormulaType(node, type)
    }
    const signatures: Record<
      string,
      {
        args: FormulaStaticType[]
        result: FormulaStaticType
        optionalLast?: boolean
      }
    > = {
      floor: { args: ["number"], result: "integer" },
      ceil: { args: ["number"], result: "integer" },
      length: { args: ["text"], result: "integer" },
      substr: {
        args: ["text", "integer", "integer"],
        result: "text",
        optionalLast: true,
      },
      lower_ascii: { args: ["text"], result: "text" },
      upper_ascii: { args: ["text"], result: "text" },
      date_add_days: { args: ["date", "integer"], result: "date" },
      date_diff_days: { args: ["date", "date"], result: "integer" },
      datetime_add_milliseconds: {
        args: ["datetime", "integer"],
        result: "datetime",
      },
      datetime_diff_milliseconds: {
        args: ["datetime", "datetime"],
        result: "integer",
      },
    }
    if (name === "concat") {
      arity(2, 16)
      for (const argument of args)
        requireFormulaType(infer(argument, "text"), "text", "CONCAT")
      return setFormulaType(node, "text")
    }
    const signature = signatures[name]
    if (!signature)
      throw new EidosFileError(
        "invalid-schema",
        `Unsupported Formula function: ${name}`
      )
    arity(
      signature.optionalLast
        ? signature.args.length - 1
        : signature.args.length,
      signature.args.length
    )
    if (
      name === "substr" &&
      args.length === 3 &&
      args[2]?.type === "unary" &&
      args[2].op === "-" &&
      args[2].operand?.literal
    ) {
      const literal = args[2].operand.literal
      if (literal.type === "integer" && BigInt(literal.raw) > 0n) {
        throw new EidosFileError(
          "invalid-formula",
          "SUBSTR literal length cannot be negative"
        )
      }
    }
    args.forEach((argument, index) =>
      requireFormulaType(
        infer(argument, signature.args[index]!),
        signature.args[index]!,
        name
      )
    )
    return setFormulaType(node, signature.result)
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
    if (op === "&") return `((${left}) || (${right}))`
    if (["+", "-", "*"].includes(op)) {
      const suffix = op === "+" ? "add" : op === "-" ? "sub" : "mul"
      return `eidos_formula_${node.inferred === "integer" ? "int" : "num"}_${suffix}(${left}, ${right})`
    }
    if (op === "/") return `eidos_formula_num_div(${left}, ${right})`
    if (op === "%") return `eidos_formula_int_mod(${left}, ${right})`
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
      }[op]
      return `eidos_formula_numeric_${suffix}(${left}, ${right})`
    }
    return `((${left}) COLLATE BINARY ${op} (${right}) COLLATE BINARY)`
  }
  if (node.type === "call") {
    const name = String(node.function?.name).toLowerCase()
    const args = (node.args ?? []).map(compile)
    if (name === "if")
      return `(CASE WHEN (${args[0]}) THEN (${args[1]}) ELSE (${args[2]}) END)`
    if (name === "coalesce") return `coalesce(${args.join(", ")})`
    if (name === "is_null") return `((${args[0]}) IS NULL)`
    if (name === "abs")
      return `eidos_formula_${node.inferred === "integer" ? "int" : "num"}_abs(${args[0]})`
    if (name === "floor" || name === "ceil")
      return `eidos_formula_${name}(${args[0]})`
    if (name === "min" || name === "max") {
      const mixed =
        (node.args ?? []).some((arg) => arg.inferred === "number") &&
        (node.args ?? []).some((arg) => arg.inferred === "integer")
      return mixed
        ? `eidos_formula_numeric_${name}(${args.join(", ")})`
        : `${name}(${args.join(", ")})`
    }
    if (name === "concat")
      return `(${args.map((arg) => `(${arg})`).join(" || ")})`
    if (name === "length") return `eidos_formula_length(${args[0]})`
    if (name === "substr")
      return `eidos_formula_substr${args.length}(${args.join(", ")})`
    if (name === "lower_ascii") return `eidos_formula_lower_ascii(${args[0]})`
    if (name === "upper_ascii") return `eidos_formula_upper_ascii(${args[0]})`
    return `eidos_formula_${name}(${args.join(", ")})`
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
    if (["=", "!=", "<", "<=", ">", ">="].includes(op)) return 4
    if (op === "&") return 5
    if (op === "+" || op === "-") return 6
    return 7
  }
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
    const precedence = exactFormulaPrecedence(node)
    const comparison = ["=", "!=", "<", "<=", ">", ">="].includes(op)
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
    return `${child(node.left!, false)} ${op} ${child(node.right!, true)}`
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
