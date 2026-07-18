export const SUPPORTED_SQLITE_EXTENSIONS = [
  ".eidos",
  ".sqlite",
  ".sqlite3",
  ".db",
  ".db3",
] as const

export const SQLITE_FILE_ACCEPT = [
  ...SUPPORTED_SQLITE_EXTENSIONS,
  "application/vnd.sqlite3",
  "application/x-sqlite3",
].join(",")

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

export function hasSupportedSQLiteExtension(fileName: string): boolean {
  const normalized = fileName.toLowerCase()
  return SUPPORTED_SQLITE_EXTENSIONS.some((extension) =>
    normalized.endsWith(extension)
  )
}

export function assertSupportedSQLiteFileName(fileName: string): void {
  if (hasSupportedSQLiteExtension(fileName)) return
  throw new SQLiteFileValidationError(
    "unsupported-extension",
    `“${fileName}” is not a supported SQLite file. Choose .eidos, .sqlite, .sqlite3, .db, or .db3.`
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

export async function validateSQLiteFile(file: File): Promise<void> {
  assertSupportedSQLiteFileName(file.name)
  assertSQLiteHeader(
    await file.slice(0, SQLITE_MINIMUM_HEADER_BYTES).arrayBuffer()
  )
}
