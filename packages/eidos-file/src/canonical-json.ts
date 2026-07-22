import { EidosFileError } from "./errors"

export type EidosFileJsonValue =
  | null
  | boolean
  | number
  | string
  | EidosFileJsonValue[]
  | { [key: string]: EidosFileJsonValue }

function assertUnicodeScalarString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new EidosFileError(
          "invalid-value",
          "I-JSON strings cannot contain unpaired surrogates"
        )
      }
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new EidosFileError(
        "invalid-value",
        "I-JSON strings cannot contain unpaired surrogates"
      )
    }
  }
}

function assertNoDuplicateJsonKeys(text: string): void {
  let index = 0
  const whitespace = (): void => {
    while (/\s/u.test(text[index] ?? "")) index += 1
  }
  const string = (): string => {
    const start = index++
    while (index < text.length) {
      if (text[index] === "\\") {
        index += 2
      } else if (text[index] === '"') {
        index += 1
        return JSON.parse(text.slice(start, index)) as string
      } else {
        index += 1
      }
    }
    throw new EidosFileError("invalid-value", "Value is not valid JSON")
  }
  const value = (): void => {
    whitespace()
    if (text[index] === '"') {
      string()
      return
    }
    if (text[index] === "[") {
      index += 1
      whitespace()
      if (text[index] === "]") {
        index += 1
        return
      }
      while (index < text.length) {
        value()
        whitespace()
        if (text[index] === "]") {
          index += 1
          return
        }
        if (text[index++] !== ",") break
      }
      throw new EidosFileError("invalid-value", "Value is not valid JSON")
    }
    if (text[index] === "{") {
      index += 1
      const keys = new Set<string>()
      whitespace()
      if (text[index] === "}") {
        index += 1
        return
      }
      while (index < text.length) {
        whitespace()
        if (text[index] !== '"') break
        const key = string()
        if (keys.has(key)) {
          throw new EidosFileError(
            "invalid-value",
            `Duplicate I-JSON object key: ${key}`
          )
        }
        keys.add(key)
        whitespace()
        if (text[index++] !== ":") break
        value()
        whitespace()
        if (text[index] === "}") {
          index += 1
          return
        }
        if (text[index++] !== ",") break
      }
      throw new EidosFileError("invalid-value", "Value is not valid JSON")
    }
    while (index < text.length && !/[\s,\]}]/u.test(text[index]!)) index += 1
  }
  value()
  whitespace()
  if (index !== text.length) {
    throw new EidosFileError("invalid-value", "Value is not valid JSON")
  }
}

function normalize(value: unknown, stack: Set<object>): EidosFileJsonValue {
  if (value === null || typeof value === "boolean") {
    return value
  }
  if (typeof value === "string") {
    assertUnicodeScalarString(value)
    return value
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new EidosFileError(
        "invalid-value",
        "Canonical JSON numbers must be finite binary64 values"
      )
    }
    return Object.is(value, -0) ? 0 : value
  }
  if (typeof value !== "object" || value === undefined) {
    throw new EidosFileError("invalid-value", "Value is not valid I-JSON")
  }
  if (stack.has(value)) {
    throw new EidosFileError("invalid-value", "Canonical JSON cannot be cyclic")
  }
  stack.add(value)
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => normalize(entry, stack))
    }
    const normalized: Record<string, EidosFileJsonValue> = {}
    for (const key of Object.keys(value).sort()) {
      assertUnicodeScalarString(key)
      normalized[key] = normalize(
        (value as Record<string, unknown>)[key],
        stack
      )
    }
    return normalized
  } finally {
    stack.delete(value)
  }
}

/** RFC 8785-compatible canonical serialization for the Eidos JSON subset. */
export function canonicalizeEidosFileJson(value: unknown): string {
  return JSON.stringify(normalize(value, new Set()))
}

export function parseEidosFileJson(text: string): EidosFileJsonValue {
  let value: unknown
  try {
    assertNoDuplicateJsonKeys(text)
    value = JSON.parse(text)
  } catch (error) {
    if (error instanceof EidosFileError) throw error
    throw new EidosFileError("invalid-value", "Value is not valid JSON")
  }
  return normalize(value, new Set())
}

export function isCanonicalEidosFileJson(text: string): boolean {
  try {
    return canonicalizeEidosFileJson(parseEidosFileJson(text)) === text
  } catch {
    return false
  }
}
