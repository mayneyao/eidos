import type ts from "typescript"
import { PluginError } from "./errors"
import { loadTypeScript } from "./toolchain"

function fail(message: string): never {
  throw new PluginError("SOURCE_INVALID", message)
}
export function inlineManifest(source: ts.SourceFile): unknown | undefined {
  const ts = loadTypeScript()
  let found = false
  let value: unknown
  function literal(node: ts.Expression): unknown {
    if (
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isTypeAssertionExpression(node)
    )
      return literal(node.expression)
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      return node.text
    if (ts.isNumericLiteral(node)) return Number(node.text)
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false
    if (node.kind === ts.SyntaxKind.NullKeyword) return null
    if (
      ts.isPrefixUnaryExpression(node) &&
      node.operator === ts.SyntaxKind.MinusToken &&
      ts.isNumericLiteral(node.operand)
    )
      return -Number(node.operand.text)
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal)
    if (ts.isObjectLiteralExpression(node)) {
      const result: Record<string, unknown> = Object.create(null)
      for (const item of node.properties) {
        if (
          !ts.isPropertyAssignment(item) ||
          !(ts.isIdentifier(item.name) || ts.isStringLiteral(item.name))
        )
          fail("Manifest properties must be literal assignments")
        const key = item.name.text
        if (Object.hasOwn(result, key)) fail("Duplicate manifest property")
        result[key] = literal(item.initializer)
      }
      return result
    }
    fail("Manifest must contain only static JSON literals")
  }
  for (const statement of source.statements) {
    if (
      !ts.isVariableStatement(statement) ||
      !statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    )
      continue
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== "manifest"
      )
        continue
      if (
        found ||
        !(statement.declarationList.flags & ts.NodeFlags.Const) ||
        !declaration.initializer
      )
        fail("Expected one exported const manifest")
      found = true
      value = literal(declaration.initializer)
    }
  }
  return value
}

/** Static checks complement, and never replace, the runtime sandbox. */
export function validateSource(
  source: ts.SourceFile,
  bundled = false,
  dependency = false
): void {
  const ts = loadTypeScript()
  if (source.referencedFiles.length || source.typeReferenceDirectives.length)
    fail("Triple-slash references are not supported")
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (bundled && node.moduleSpecifier)
        fail("Package entries must be self-contained")
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === "@eidos.space/plugin-sdk"
      ) {
        const clause = node.importClause
        const bindings = clause?.namedBindings
        if (
          !clause ||
          (!clause.isTypeOnly &&
            (!bindings ||
              !ts.isNamedImports(bindings) ||
              clause.name ||
              bindings.elements.some((e) => !e.isTypeOnly)))
        )
          fail("Core SDK imports must be type-only")
      }
    }
    if (ts.isImportEqualsDeclaration(node))
      fail("Runtime require is not supported")
    if (ts.isCallExpression(node)) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        (bundled ||
          node.arguments.length !== 1 ||
          !ts.isStringLiteral(node.arguments[0]))
      )
        fail("Dynamic import must be a static local module")
      if (
        ts.isIdentifier(node.expression) &&
        ["require", "eval", "Function"].includes(node.expression.text) &&
        !(
          dependency &&
          !bundled &&
          node.expression.text === "require" &&
          node.arguments.length === 1 &&
          ts.isStringLiteral(node.arguments[0])
        )
      )
        fail("Dynamic host code execution is not supported")
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "Function"
    )
      fail("Dynamic code generation is not supported")
    ts.forEachChild(node, visit)
  }
  visit(source)
}
