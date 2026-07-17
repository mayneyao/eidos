import type {
  EidosFileRowValue,
  EidosFileSelectOption,
} from "@eidos.space/eidos-file"

interface LegacySelectOption {
  id?: unknown
  name?: unknown
  color?: unknown
}

function legacyOptions(
  property: Record<string, unknown> | null
): LegacySelectOption[] {
  return Array.isArray(property?.options)
    ? property.options.filter(
        (option): option is LegacySelectOption =>
          typeof option === "object" && option !== null
      )
    : []
}

export function legacySelectValueMap(
  property: Record<string, unknown> | null
): Map<string, string> {
  const values = new Map<string, string>()
  for (const option of legacyOptions(property)) {
    const id = typeof option.id === "string" ? option.id : null
    const name = typeof option.name === "string" ? option.name : null
    const value = name?.trim() ? name : id
    if (!value) continue
    if (id) values.set(id, value)
    if (!values.has(value)) values.set(value, value)
  }
  return values
}

export function eidosFileSelectPropertyFromLegacy(
  property: Record<string, unknown> | null
): Record<string, unknown> {
  const valueById = legacySelectValueMap(property)
  const values = new Set<string>()
  const options: EidosFileSelectOption[] = []
  for (const option of legacyOptions(property)) {
    const id = typeof option.id === "string" ? option.id : null
    const name = typeof option.name === "string" ? option.name : null
    const value = (id ? valueById.get(id) : undefined) ?? name
    if (!value || values.has(value)) continue
    values.add(value)
    options.push({
      value,
      color: typeof option.color === "string" ? option.color : "default",
    })
  }
  const {
    options: _legacyOptions,
    defaultOption: legacyDefaultOption,
    ...rest
  } = property ?? {}
  const defaultOption =
    typeof legacyDefaultOption === "string"
      ? (valueById.get(legacyDefaultOption) ?? legacyDefaultOption)
      : undefined
  return {
    ...rest,
    options,
    ...(defaultOption ? { defaultOption } : {}),
  }
}

export function decodeLegacyStringList(
  value: EidosFileRowValue | undefined
): string[] {
  if (typeof value !== "string" || !value.trim()) return []
  const trimmed = value.trim()
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (entry): entry is string => typeof entry === "string"
        )
      }
    } catch {
      // Treat malformed legacy input as a single value below.
    }
  }
  return trimmed.split(",").map((entry) => entry.trim())
}

export function migrateLegacyStringArray(
  value: EidosFileRowValue | undefined,
  transform: (value: string) => string | null = (entry) => entry
): string | null {
  const seen = new Set<string>()
  const values = decodeLegacyStringList(value).flatMap((entry) => {
    const migrated = transform(entry)?.trim()
    if (!migrated || seen.has(migrated)) return []
    seen.add(migrated)
    return [migrated]
  })
  return values.length > 0 ? JSON.stringify(values) : null
}

export function migrateLegacySelectValue(
  value: EidosFileRowValue | undefined,
  valueById: ReadonlyMap<string, string>
): EidosFileRowValue {
  return typeof value === "string"
    ? (valueById.get(value) ?? value)
    : (value ?? null)
}
