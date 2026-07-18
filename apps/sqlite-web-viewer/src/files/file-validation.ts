export const BUILT_IN_SQLITE_EXTENSIONS = [
  ".eidos",
  ".sqlite",
  ".sqlite3",
  ".db",
  ".db3",
] as const

export const SUPPORTED_SQLITE_EXTENSIONS = BUILT_IN_SQLITE_EXTENSIONS

const SQLITE_HEADER = new TextEncoder().encode("SQLite format 3\0")
const SQLITE_MINIMUM_HEADER_BYTES = 100

export type SQLiteFileValidationCode =
  | "unsupported-extension"
  | "not-sqlite"
  | "truncated"

export class SQLiteFileValidationError extends Error {
  constructor(
    readonly code: SQLiteFileValidationCode,
    message: string
  ) {
    super(message)
    this.name = "SQLiteFileValidationError"
  }
}

export function allSQLiteExtensions(
  customExtensions: readonly string[] = []
): string[] {
  return [
    ...new Set([
      ...BUILT_IN_SQLITE_EXTENSIONS,
      ...customExtensions.map((extension) => extension.toLowerCase()),
    ]),
  ]
}

export function sqliteFileAccept(customExtensions: readonly string[] = []) {
  return [
    ...allSQLiteExtensions(customExtensions),
    "application/vnd.sqlite3",
    "application/x-sqlite3",
  ].join(",")
}

export const SQLITE_FILE_ACCEPT = sqliteFileAccept()

export function hasSupportedSQLiteExtension(
  fileName: string,
  customExtensions: readonly string[] = []
): boolean {
  const normalized = fileName.toLowerCase()
  return allSQLiteExtensions(customExtensions).some((extension) =>
    normalized.endsWith(extension)
  )
}

export function assertSupportedSQLiteFileName(
  fileName: string,
  customExtensions: readonly string[] = []
): void {
  if (hasSupportedSQLiteExtension(fileName, customExtensions)) return
  const accepted = allSQLiteExtensions(customExtensions)
  throw new SQLiteFileValidationError(
    "unsupported-extension",
    `“${fileName}” is not a supported SQLite file. Choose ${accepted.slice(0, -1).join(", ")}, or ${accepted.at(-1)}; you can also add its suffix in file settings.`
  )
}

export function hasSQLiteHeader(bytes: ArrayBuffer | Uint8Array): boolean {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (view.byteLength < SQLITE_HEADER.byteLength) return false
  return SQLITE_HEADER.every((byte, index) => view[index] === byte)
}

export function assertSQLiteHeader(bytes: ArrayBuffer | Uint8Array): void {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (view.byteLength < SQLITE_MINIMUM_HEADER_BYTES) {
    throw new SQLiteFileValidationError(
      "truncated",
      "This file is too small to contain a complete SQLite database header."
    )
  }
  if (hasSQLiteHeader(view)) return
  throw new SQLiteFileValidationError(
    "not-sqlite",
    "The file header is not SQLite. The database may be encrypted, damaged, or use a different format."
  )
}

export async function validateSQLiteFile(
  file: File,
  customExtensions: readonly string[] = []
): Promise<void> {
  assertSupportedSQLiteFileName(file.name, customExtensions)
  assertSQLiteHeader(
    await file.slice(0, SQLITE_MINIMUM_HEADER_BYTES).arrayBuffer()
  )
}
