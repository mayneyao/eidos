/**
 * Base Server Database interface
 * Copied from @eidos.space/core/sqlite/interface.ts since npm dist doesn't export this module
 */

type CommonVersionControlResult = Promise<Record<string, any>>

export abstract class BaseServerDatabase {
  filename?: string

  get isWalMode() {
    return true
  }

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
  }): any
}
