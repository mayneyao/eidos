import type { ViewerCellValue } from "../types"

export const TEXT_PREVIEW_CHARACTERS = 2_048
export const BLOB_PREVIEW_BYTES = 32

function splitEncodedValue(value: string): [string, string] {
  const separator = value.indexOf(":")
  return separator < 0
    ? [value, ""]
    : [value.slice(0, separator), value.slice(separator + 1)]
}

export function decodeViewerCell(encoded: unknown): ViewerCellValue {
  if (typeof encoded !== "string") {
    return { kind: "other", value: String(encoded ?? "") }
  }
  if (encoded === "n:") return { kind: "null" }

  const [kind, remainder] = splitEncodedValue(encoded)
  if (kind === "i") return { kind: "integer", value: remainder }
  if (kind === "r") {
    const numeric = Number(remainder)
    return {
      kind: "real",
      value: Number.isFinite(numeric) ? numeric : remainder,
    }
  }
  if (kind === "t" || kind === "b") {
    const [lengthText, value] = splitEncodedValue(remainder)
    const length = Number.parseInt(lengthText, 10)
    const safeLength = Number.isFinite(length) && length >= 0 ? length : 0
    if (kind === "b") {
      return { byteLength: safeLength, hexPreview: value, kind: "blob" }
    }
    return {
      kind: "text",
      totalLength: safeLength,
      truncated: safeLength > [...value].length,
      value,
    }
  }
  return { kind: "other", value: remainder || encoded }
}

export function encodedColumnExpression(columnName: string): string {
  const column = `"${columnName.replaceAll('"', '""')}"`
  return `CASE typeof(${column})
    WHEN 'null' THEN 'n:'
    WHEN 'integer' THEN 'i:' || CAST(${column} AS TEXT)
    WHEN 'real' THEN 'r:' || CAST(${column} AS TEXT)
    WHEN 'text' THEN 't:' || length(${column}) || ':' || substr(${column}, 1, ${TEXT_PREVIEW_CHARACTERS})
    WHEN 'blob' THEN 'b:' || length(${column}) || ':' || hex(substr(${column}, 1, ${BLOB_PREVIEW_BYTES}))
    ELSE 'o:' || substr(CAST(${column} AS TEXT), 1, ${TEXT_PREVIEW_CHARACTERS})
  END`
}
