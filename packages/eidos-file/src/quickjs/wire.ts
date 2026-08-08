import type { SqlValue } from "../adapter-contract"

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

export function bytesToBase64(bytes: Uint8Array): string {
  let out = ""
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!
    const b = index + 1 < bytes.length ? bytes[index + 1]! : 0
    const c = index + 2 < bytes.length ? bytes[index + 2]! : 0
    out += BASE64_ALPHABET[a >> 2]!
    out += BASE64_ALPHABET[((a & 3) << 4) | (b >> 4)]!
    out +=
      index + 1 < bytes.length
        ? BASE64_ALPHABET[((b & 15) << 2) | (c >> 6)]!
        : "="
    out += index + 2 < bytes.length ? BASE64_ALPHABET[c & 63]! : "="
  }
  return out
}

export function base64ToBytes(text: string): Uint8Array {
  const lookup = new Map<string, number>()
  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    lookup.set(BASE64_ALPHABET[index]!, index)
  }
  const clean = text.replace(/=+$/, "")
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let offset = 0
  for (let index = 0; index < clean.length; index += 4) {
    const a = lookup.get(clean[index]!) ?? 0
    const b = lookup.get(clean[index + 1]!) ?? 0
    const c = lookup.get(clean[index + 2]!) ?? 0
    const d = lookup.get(clean[index + 3]!) ?? 0
    if (offset < out.length) out[offset++] = (a << 2) | (b >> 4)
    if (offset < out.length) out[offset++] = ((b & 15) << 4) | (c >> 2)
    if (offset < out.length) out[offset++] = ((c & 3) << 6) | d
  }
  return out
}

/** JSON-safe mirror of SqlValue; blobs ride as base64 text. */
export type WireSqlValue =
  | { tag: "null" }
  | { tag: "integer"; value: string }
  | { tag: "real"; value: number }
  | { tag: "text"; value: string }
  | { tag: "blob"; value: string }

export function sqlValueToWire(value: SqlValue): WireSqlValue {
  if (value.tag === "blob") {
    return { tag: "blob", value: bytesToBase64(value.value) }
  }
  return value
}

export function wireToSqlValue(value: WireSqlValue): SqlValue {
  if (value.tag === "blob") {
    return { tag: "blob", value: base64ToBytes(value.value) }
  }
  return value
}

export function sqlValuesToWire(values: readonly SqlValue[]): WireSqlValue[] {
  return values.map(sqlValueToWire)
}

export function wireRowsToSqlValues(
  rows: readonly WireSqlValue[][]
): SqlValue[][] {
  return rows.map((row) => row.map(wireToSqlValue))
}
