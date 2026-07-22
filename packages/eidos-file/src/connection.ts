export type EidosFileSqlPrimitive = string | number | bigint | null | Uint8Array
export type EidosFileSqlParams = readonly EidosFileSqlPrimitive[]

export interface EidosFileRunResult {
  changes: number
  lastInsertRowid: number | bigint
}

export interface EidosFileConnectionCapabilities {
  /** The adapter can bind and return 64-bit integers without truncation. */
  int64: boolean
  /** JSON1 is available to canonical Relation, Lookup, and list operations. */
  json1: boolean
  /** SQLite RETURNING clauses are available. */
  returning: boolean
  /** The adapter can call sqlite3_interrupt on its active connection. */
  interrupt: boolean
  /** Deterministic scalar functions can be registered for shared semantics. */
  scalarFunctions: boolean
}

export interface EidosFileConnection {
  readonly capabilities: EidosFileConnectionCapabilities
  exec(sql: string): void
  query<T extends object>(sql: string, params?: EidosFileSqlParams): T[]
  get<T extends object>(sql: string, params?: EidosFileSqlParams): T | undefined
  run(sql: string, params?: EidosFileSqlParams): EidosFileRunResult
  runMany?(sql: string, parameterSets: readonly EidosFileSqlParams[]): void
  registerFunction(
    name: string,
    operation: (...values: EidosFileSqlPrimitive[]) => EidosFileSqlPrimitive,
    arity?: number
  ): void
  transaction<T>(operation: () => T): T
  /** Current SQLite connection-visible change counter for cache invalidation. */
  dataVersion(): number
  /** Interrupts a currently executing query when the adapter supports it. */
  interrupt(): void
  close?(): void
}
