export type EidosFileSqlPrimitive = string | number | bigint | null | Uint8Array
export type EidosFileSqlParams = readonly EidosFileSqlPrimitive[]

export interface EidosFileRunResult {
  changes: number
  lastInsertRowid: number | bigint
}

export interface EidosFileConnection {
  exec(sql: string): void
  query<T extends object>(sql: string, params?: EidosFileSqlParams): T[]
  get<T extends object>(sql: string, params?: EidosFileSqlParams): T | undefined
  run(sql: string, params?: EidosFileSqlParams): EidosFileRunResult
  runMany?(sql: string, parameterSets: readonly EidosFileSqlParams[]): void
  transaction<T>(operation: () => T): T
  close?(): void
}
