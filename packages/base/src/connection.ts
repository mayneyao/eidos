export type BaseSqlPrimitive = string | number | bigint | null | Uint8Array
export type BaseSqlParams = readonly BaseSqlPrimitive[]

export interface BaseRunResult {
  changes: number
  lastInsertRowid: number | bigint
}

export interface BaseConnection {
  exec(sql: string): void
  query<T extends object>(sql: string, params?: BaseSqlParams): T[]
  get<T extends object>(sql: string, params?: BaseSqlParams): T | undefined
  run(sql: string, params?: BaseSqlParams): BaseRunResult
  runMany?(sql: string, parameterSets: readonly BaseSqlParams[]): void
  transaction<T>(operation: () => T): T
  close?(): void
}
