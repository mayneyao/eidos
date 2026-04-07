import type { MsgType } from "@/lib/const"

export interface AggregateItem {
  column: string
  function: "sum" | "avg" | "count" | "min" | "max" | "count_distinct"
  alias?: string
}

export type IQuery = {
  type: MsgType.CallFunction
  data: {
    method: string
    params: [string, string[]]
    dbName: string
    userId: string
  }
  id: string
}

export type IQueryResp = {
  id: string
  data: {
    result: any
  }
  type: MsgType.QueryResp
}

export type ITreeItem = {
  id: string
  name: string
  type: "table" | "doc"
}

export interface ISqlite<T, D> {
  connector: T
  send: (data: D) => void | Promise<any>
  onCallBack: (thisCallId: string) => Promise<any>
  /**
   * Handle iterator/streaming functions that return AsyncIterable
   * Returns an AsyncIterable that yields values from the remote iterator
   */
  onIterator?: <TValue = any>(thisCallId: string) => AsyncIterable<TValue>
}

type CommonVersionControlResult = Promise<Record<string, any>>

export abstract class BaseServerDatabase {
  filename?: string

  get isWalMode() {
    return true
  }

  /**
   * Check if currently inside a transaction.
   * Returns true if a transaction is active.
   */
  abstract get inTransaction(): boolean

  // inspect
  info(): CommonVersionControlResult {
    return Promise.resolve({})
  }

  status(): CommonVersionControlResult {
    return Promise.resolve({})
  }

  snapshot(): CommonVersionControlResult {
    return Promise.resolve({})
  }

  tags(): CommonVersionControlResult {
    return Promise.resolve({})
  }

  volumes(): CommonVersionControlResult {
    return Promise.resolve({})
  }

  audit(): CommonVersionControlResult {
    return Promise.resolve({})
  }

  version(): CommonVersionControlResult {
    return Promise.resolve({})
  }

  // sync
  hydrate(): CommonVersionControlResult {
    return Promise.resolve({})
  }

  fetch(): CommonVersionControlResult {
    return Promise.resolve({})
  }

  pull(): CommonVersionControlResult {
    return Promise.resolve({})
  }

  push(): CommonVersionControlResult {
    return Promise.resolve({})
  }

  clone(remoteLogId?: string): CommonVersionControlResult {
    return Promise.resolve({})
  }

  convertToGraft(remote: string): CommonVersionControlResult {
    return Promise.resolve({})
  }

  exportToSqlite(outputPath?: string): CommonVersionControlResult {
    return Promise.resolve({})
  }

  abstract prepare(sql: string): {
    run: (bind?: any[]) => void
    all: (bind?: any[]) => Promise<any[]>
  }
  abstract close(): void
  abstract selectObjects(
    sql: string,
    bind?: any[]
  ): Promise<{ [columnName: string]: any }[]>
  abstract transaction<T>(
    func: (db: BaseServerDatabase) => T | Promise<T>
  ): Promise<T>
  abstract exec(
    opts:
      | string
      | {
          sql: string
          bind?: any[]
          rowMode?: "array" | "object"
          returnValue?: "resultRows" | "saveSql"
        }
  ): Promise<any>
  abstract createFunction(opt: {
    name: string
    xFunc: (...args: any[]) => any
    deterministic: boolean
    nArg?: number
  }): any
  abstract table(
    name: string,
    options: {
      rows: (...params: unknown[]) => Generator
      columns: string[]
      parameters?: string[]
      safeIntegers?: boolean
      directOnly?: boolean
    }
  ): any
  abstract selectObjectsSync(
    sql: string,
    bind?: any[]
  ): { [columnName: string]: any }[]
}
