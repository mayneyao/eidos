export const READ_ONLY_OPEN_FLAGS = "r" as const

export const READ_ONLY_BOOTSTRAP_SQL =
  "PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;"

// SQLite's authorizer action codes are stable public API values. The worker
// allows query compilation only; all schema, transaction, attachment, and data
// mutation actions are denied even though the database handle is also opened r/o.
export const SQLITE_AUTH = {
  OK: 0,
  DENY: 1,
  PRAGMA: 19,
  READ: 20,
  SELECT: 21,
  FUNCTION: 31,
  RECURSIVE: 33,
} as const

const READ_PRAGMAS = new Set([
  "application_id",
  "encoding",
  "freelist_count",
  "page_count",
  "page_size",
  "query_only",
  "schema_version",
  "user_version",
])

const ARGUMENT_READ_PRAGMAS = new Set([
  "foreign_key_list",
  "index_list",
  "index_xinfo",
  "table_xinfo",
])

export function readonlyAuthorizerResult(
  actionCode: number,
  pragmaName: string | 0,
  pragmaValue: string | 0
): number {
  if (
    actionCode === SQLITE_AUTH.READ ||
    actionCode === SQLITE_AUTH.SELECT ||
    actionCode === SQLITE_AUTH.FUNCTION ||
    actionCode === SQLITE_AUTH.RECURSIVE
  ) {
    return SQLITE_AUTH.OK
  }
  if (actionCode === SQLITE_AUTH.PRAGMA) {
    const name = typeof pragmaName === "string" ? pragmaName.toLowerCase() : ""
    return (READ_PRAGMAS.has(name) && !pragmaValue) ||
      ARGUMENT_READ_PRAGMAS.has(name)
      ? SQLITE_AUTH.OK
      : SQLITE_AUTH.DENY
  }
  return SQLITE_AUTH.DENY
}

export function assertQueryOnly(value: unknown): void {
  if (value === 1 || value === 1n || value === "1") return
  throw new Error("SQLite query_only could not be enforced")
}
