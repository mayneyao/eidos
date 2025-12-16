/**
 * Method routing utilities
 * Handles method paths like "table(id).rows.query()"
 */

/**
 * Parse a method path into components
 * Example: "table(123).rows.query" -> ["table(123)", "rows", "query"]
 */
export function parseMethodPath(methodPath: string): string[] {
  const parts: string[] = []
  let current = ''
  let inParens = 0

  for (let i = 0; i < methodPath.length; i++) {
    const char = methodPath[i]

    if (char === '(') {
      inParens++
      current += char
    } else if (char === ')') {
      inParens--
      current += char
    } else if (char === '.' && inParens === 0) {
      if (current) parts.push(current)
      current = ''
    } else {
      current += char
    }
  }

  if (current) parts.push(current)

  return parts
}

/**
 * Check if a method part contains a function call
 * Example: "table(123)" -> true, "rows" -> false
 */
export function isFunctionCall(part: string): boolean {
  return part.includes('(') && part.includes(')')
}

/**
 * Extract function name and parameters from a function call
 * Example: "table(\"123\")" -> { name: "table", params: ['"123"'] }
 */
export function parseFunctionCall(call: string): {
  name: string
  params: string[]
} {
  const match = call.match(/^(\w+)\((.*)\)$/)
  if (!match) {
    throw new Error(`Invalid function call: ${call}`)
  }

  const [, name, paramsStr] = match
  const params = paramsStr ? paramsStr.split(',').map((p) => p.trim()) : []

  return { name, params }
}

/**
 * Build a full method path from components
 * Example: ["table", "123", "rows", "query"] -> "table(123).rows.query"
 */
export function buildMethodPath(...parts: string[]): string {
  return parts.join('.')
}

/**
 * Normalize a method path for consistency
 * Handles various formats like table("id") vs table(id)
 */
export function normalizeMethodPath(path: string): string {
  return path.replace(/\s+/g, '') // Remove whitespace
}

/**
 * Check if a method path matches a pattern
 * Supports wildcards: "table(*).rows.*"
 */
export function matchesPattern(path: string, pattern: string): boolean {
  const pathParts = parseMethodPath(path)
  const patternParts = parseMethodPath(pattern)

  if (pathParts.length !== patternParts.length) {
    return false
  }

  for (let i = 0; i < pathParts.length; i++) {
    const pathPart = pathParts[i]
    const patternPart = patternParts[i]

    if (patternPart === '*') {
      continue
    }

    if (isFunctionCall(patternPart)) {
      const { name } = parseFunctionCall(patternPart)
      if (!pathPart.startsWith(name + '(')) {
        return false
      }
    } else if (pathPart !== patternPart) {
      return false
    }
  }

  return true
}

