import { BUILT_IN_SQLITE_EXTENSIONS } from "./file-validation"

export const CUSTOM_SQLITE_EXTENSIONS_STORAGE_KEY =
  "sqlite-web-viewer-custom-extensions"

const MAX_CUSTOM_EXTENSIONS = 20
const CUSTOM_EXTENSION_PATTERN = /^\.[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/

export class CustomSQLiteExtensionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CustomSQLiteExtensionError"
  }
}

export function normalizeCustomSQLiteExtension(value: string): string {
  const trimmed = value.trim().toLowerCase()
  const normalized = trimmed.startsWith(".") ? trimmed : `.${trimmed}`
  if (!CUSTOM_EXTENSION_PATTERN.test(normalized)) {
    throw new CustomSQLiteExtensionError(
      "Use 1–32 letters or numbers; dots, dashes, and underscores may appear in the middle."
    )
  }
  return normalized
}

export function addCustomSQLiteExtension(
  current: readonly string[],
  value: string
): string[] {
  const extension = normalizeCustomSQLiteExtension(value)
  if (
    BUILT_IN_SQLITE_EXTENSIONS.some((builtIn) => builtIn === extension) ||
    current.includes(extension)
  ) {
    throw new CustomSQLiteExtensionError(`${extension} is already accepted.`)
  }
  if (current.length >= MAX_CUSTOM_EXTENSIONS) {
    throw new CustomSQLiteExtensionError(
      `You can save up to ${MAX_CUSTOM_EXTENSIONS} custom suffixes.`
    )
  }
  return [...current, extension].sort((left, right) =>
    left.localeCompare(right)
  )
}

export function sanitizeCustomSQLiteExtensions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const extensions: string[] = []
  for (const candidate of value) {
    if (typeof candidate !== "string") continue
    try {
      const normalized = normalizeCustomSQLiteExtension(candidate)
      if (
        !BUILT_IN_SQLITE_EXTENSIONS.some((builtIn) => builtIn === normalized) &&
        !extensions.includes(normalized)
      ) {
        extensions.push(normalized)
      }
    } catch {
      // Invalid persisted values are ignored rather than blocking the viewer.
    }
    if (extensions.length === MAX_CUSTOM_EXTENSIONS) break
  }
  return extensions.sort((left, right) => left.localeCompare(right))
}

export function loadCustomSQLiteExtensions(
  storage: Pick<Storage, "getItem"> = localStorage
): string[] {
  try {
    const stored = storage.getItem(CUSTOM_SQLITE_EXTENSIONS_STORAGE_KEY)
    return stored ? sanitizeCustomSQLiteExtensions(JSON.parse(stored)) : []
  } catch {
    return []
  }
}

export function saveCustomSQLiteExtensions(
  extensions: readonly string[],
  storage: Pick<Storage, "setItem"> = localStorage
): boolean {
  try {
    storage.setItem(
      CUSTOM_SQLITE_EXTENSIONS_STORAGE_KEY,
      JSON.stringify(sanitizeCustomSQLiteExtensions(extensions))
    )
    return true
  } catch {
    return false
  }
}
