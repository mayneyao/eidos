import type ts from "typescript"
import { invalid } from "./errors"
import { loadTypeScript } from "./toolchain"

/** JSON.parse alone silently accepts duplicate keys, which this protocol forbids. */
export function parseJson(text: string): unknown {
  const ts = loadTypeScript()
  const value: unknown = JSON.parse(text)
  const source = ts.parseJsonText("plugin.json", text)
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const keys = new Set<string>()
      for (const property of node.properties) {
        if (
          !ts.isPropertyAssignment(property) ||
          !ts.isStringLiteral(property.name)
        )
          invalid("Invalid JSON property")
        if (keys.has(property.name.text)) invalid("Duplicate JSON key")
        keys.add(property.name.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return value
}
