import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"

export function columnNameFor(
  label: string,
  fields: readonly EidosFileFieldInfo[]
): string {
  const ascii = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  const candidate = ascii
    ? /^[0-9]/.test(ascii)
      ? `field_${ascii}`
      : ascii
    : "field"
  const used = new Set(fields.map((field) => field.tableColumnName))
  if (!used.has(candidate)) return candidate
  let suffix = 2
  while (used.has(`${candidate}_${suffix}`)) suffix += 1
  return `${candidate}_${suffix}`
}
