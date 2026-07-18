import {
  assertQueryOnly,
  READ_ONLY_OPEN_FLAGS,
  readonlyAuthorizerResult,
  SQLITE_AUTH,
} from "./read-only-policy"

describe("read-only SQLite policy", () => {
  it("opens with SQLite's read-only flag", () => {
    expect(READ_ONLY_OPEN_FLAGS).toBe("r")
  })

  it("allows reads and denies mutation, transaction, and attach actions", () => {
    expect(readonlyAuthorizerResult(SQLITE_AUTH.SELECT, 0, 0)).toBe(
      SQLITE_AUTH.OK
    )
    expect(readonlyAuthorizerResult(SQLITE_AUTH.READ, 0, 0)).toBe(
      SQLITE_AUTH.OK
    )
    expect(readonlyAuthorizerResult(18, "entries", 0)).toBe(SQLITE_AUTH.DENY)
    expect(readonlyAuthorizerResult(22, "BEGIN", 0)).toBe(SQLITE_AUTH.DENY)
    expect(readonlyAuthorizerResult(24, "other.db", 0)).toBe(SQLITE_AUTH.DENY)
  })

  it("allows only known read pragmas without assignment", () => {
    expect(readonlyAuthorizerResult(SQLITE_AUTH.PRAGMA, "page_size", 0)).toBe(
      SQLITE_AUTH.OK
    )
    expect(
      readonlyAuthorizerResult(SQLITE_AUTH.PRAGMA, "query_only", "OFF")
    ).toBe(SQLITE_AUTH.DENY)
    expect(
      readonlyAuthorizerResult(SQLITE_AUTH.PRAGMA, "table_xinfo", "entries")
    ).toBe(SQLITE_AUTH.OK)
    expect(
      readonlyAuthorizerResult(SQLITE_AUTH.PRAGMA, "journal_mode", 0)
    ).toBe(SQLITE_AUTH.DENY)
  })

  it("requires query_only to be enabled", () => {
    expect(() => assertQueryOnly(1)).not.toThrow()
    expect(() => assertQueryOnly(0)).toThrow(/could not be enforced/)
  })
})
