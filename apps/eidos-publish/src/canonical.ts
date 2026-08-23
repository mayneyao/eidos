const encoder = new TextEncoder()

export function canonicalJson(value: unknown): string {
  return serialize(value)
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return encoder.encode(canonicalJson(value))
}

export async function canonicalSha256(value: unknown): Promise<string> {
  return sha256Hex(canonicalJsonBytes(value).slice().buffer)
}

export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function serialize(value: unknown): string {
  if (value === null) return "null"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "string") {
    assertUnicodeScalarString(value)
    return JSON.stringify(value)
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite JSON number")
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return "[" + value.map((item) => serialize(item)).join(",") + "]"
  }
  if (isPlainRecord(value)) {
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((key) => {
          assertUnicodeScalarString(key)
          const item = value[key]
          if (item === undefined) throw new TypeError("undefined JSON member")
          return JSON.stringify(key) + ":" + serialize(item)
        })
        .join(",") +
      "}"
    )
  }
  throw new TypeError("value is not JSON data")
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value) as object | null
  return prototype === Object.prototype || prototype === null
}

function assertUnicodeScalarString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) {
        throw new TypeError("JSON string contains an unpaired surrogate")
      }
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError("JSON string contains an unpaired surrogate")
    }
  }
}
