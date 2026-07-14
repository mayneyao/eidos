import {
  createScanner,
  parseTree,
  printParseErrorCode,
  type Node as JsonNode,
  type ParseError,
} from "jsonc-parser"

// jsonc-parser exposes these values as ambient const enums. Referencing those
// enums is incompatible with isolatedModules, so keep the small scanner token
// boundary local and explicit.
const JSON_TOKEN = {
  openBrace: 1,
  closeBrace: 2,
  openBracket: 3,
  closeBracket: 4,
  eof: 17,
} as const
const NO_SCAN_ERROR = 0

export type StrictJsonIssueKind =
  | "too-large"
  | "too-deep"
  | "syntax"
  | "duplicate-key"

export interface StrictJsonIssue {
  kind: StrictJsonIssueKind
  message: string
  pointer?: string
  offset?: number
  length?: number
}

export interface StrictJsonResult {
  value?: unknown
  issues: StrictJsonIssue[]
}

export interface StrictJsonOptions {
  label: string
  maxBytes: number
  maxDepth: number
}

function escapeJsonPointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1")
}

function jsonPointer(path: readonly (string | number)[]): string {
  if (path.length === 0) return ""
  return `/${path.map((part) => escapeJsonPointerSegment(String(part))).join("/")}`
}

function findDuplicateKeys(root: JsonNode): StrictJsonIssue[] {
  const issues: StrictJsonIssue[] = []
  const stack: Array<{
    node: JsonNode
    path: Array<string | number>
  }> = [{ node: root, path: [] }]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) break
    const { node, path } = current

    if (node.type === "object") {
      const seen = new Set<string>()
      for (const property of node.children ?? []) {
        const [keyNode, valueNode] = property.children ?? []
        if (!keyNode || typeof keyNode.value !== "string") continue
        const key = keyNode.value
        const childPath = [...path, key]
        if (seen.has(key)) {
          issues.push({
            kind: "duplicate-key",
            message: `Duplicate JSON key: ${key}`,
            pointer: jsonPointer(childPath),
            offset: keyNode.offset,
            length: keyNode.length,
          })
        } else {
          seen.add(key)
        }
        if (valueNode) stack.push({ node: valueNode, path: childPath })
      }
      continue
    }

    if (node.type === "array") {
      const children = node.children ?? []
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push({ node: children[index], path: [...path, index] })
      }
    }
  }

  return issues
}

function scanDepth(
  text: string,
  label: string,
  maxDepth: number
): StrictJsonIssue | undefined {
  const scanner = createScanner(text, false)
  let depth = 0

  for (;;) {
    const token = scanner.scan()
    if (token === JSON_TOKEN.eof) return undefined
    if (scanner.getTokenError() !== NO_SCAN_ERROR) continue

    if (token === JSON_TOKEN.openBrace || token === JSON_TOKEN.openBracket) {
      depth += 1
      if (depth > maxDepth) {
        return {
          kind: "too-deep",
          message: `${label} exceeds the maximum JSON depth of ${maxDepth}`,
          offset: scanner.getTokenOffset(),
          length: scanner.getTokenLength(),
        }
      }
    } else if (
      token === JSON_TOKEN.closeBrace ||
      token === JSON_TOKEN.closeBracket
    ) {
      depth = Math.max(0, depth - 1)
    }
  }
}

export function parseStrictJson(
  text: string,
  options: StrictJsonOptions
): StrictJsonResult {
  const byteLength = Buffer.byteLength(text, "utf8")
  if (byteLength > options.maxBytes) {
    return {
      issues: [
        {
          kind: "too-large",
          message: `${options.label} is ${byteLength} bytes; the limit is ${options.maxBytes}`,
        },
      ],
    }
  }

  const depthIssue = scanDepth(text, options.label, options.maxDepth)
  if (depthIssue) return { issues: [depthIssue] }

  const parseErrors: ParseError[] = []
  const root = parseTree(text, parseErrors, {
    allowEmptyContent: false,
    allowTrailingComma: false,
    disallowComments: true,
  })
  if (!root || parseErrors.length > 0) {
    return {
      issues: parseErrors.length
        ? parseErrors.map((error) => ({
            kind: "syntax" as const,
            message: `${options.label} is not strict JSON: ${printParseErrorCode(error.error)}`,
            offset: error.offset,
            length: error.length,
          }))
        : [
            {
              kind: "syntax",
              message: `${options.label} is empty or not valid JSON`,
            },
          ],
    }
  }

  const duplicateIssues = findDuplicateKeys(root)
  if (duplicateIssues.length > 0) return { issues: duplicateIssues }

  try {
    return { value: JSON.parse(text), issues: [] }
  } catch (error) {
    return {
      issues: [
        {
          kind: "syntax",
          message: `${options.label} is not strict JSON: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    }
  }
}
