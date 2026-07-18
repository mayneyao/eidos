import {
  assertSQLiteHeader,
  assertSupportedSQLiteFileName,
  hasSQLiteHeader,
  hasSupportedSQLiteExtension,
  SQLiteFileValidationError,
} from "./file-validation"

function sqliteBytes(size = 100): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set(new TextEncoder().encode("SQLite format 3\0"))
  return bytes
}

describe("SQLite file validation", () => {
  it.each([
    "space.eidos",
    "data.sqlite",
    "data.sqlite3",
    "data.db",
    "data.db3",
    "UPPER.EIDOS",
  ])("accepts %s", (fileName) => {
    expect(hasSupportedSQLiteExtension(fileName)).toBe(true)
    expect(() => assertSupportedSQLiteFileName(fileName)).not.toThrow()
  })

  it("rejects unrelated extensions before loading", () => {
    expect(() => assertSupportedSQLiteFileName("database.txt")).toThrowError(
      SQLiteFileValidationError
    )
  })

  it("recognizes the exact SQLite format 3 header", () => {
    expect(hasSQLiteHeader(sqliteBytes())).toBe(true)
    expect(() => assertSQLiteHeader(sqliteBytes())).not.toThrow()
    const invalid = sqliteBytes()
    invalid[0] = 0
    expect(hasSQLiteHeader(invalid)).toBe(false)
    expect(() => assertSQLiteHeader(invalid)).toThrow(/encrypted, damaged/)
  })

  it("rejects a truncated header", () => {
    expect(() => assertSQLiteHeader(sqliteBytes(64))).toThrow(/too small/)
  })
})
