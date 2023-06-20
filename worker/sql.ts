import sqlite3InitModule, {
  Database,
  Sqlite3Static,
} from "@sqlite.org/sqlite-wasm"

import { MsgType } from "@/lib/const"
import { deleteDocFile, getDocContent, updateDocFile } from "@/lib/fs"
import { logger } from "@/lib/log"
import { ColumnTableName, TreeTableName } from "@/lib/sqlite/const"
import { buildSql, isReadOnlySql } from "@/lib/sqlite/helper"

import { SQLiteUndoRedo } from "./sql_undo_redo_v2"

const log = logger.info
const error = logger.error

export class Sqlite {
  sqlite3?: Sqlite3Static
  config?: any
  constructor() {
    this.config = {
      experiment: {
        undo: false,
      },
    }
  }

  setConfig(config: any) {
    this.config = config
  }

  getSQLite3 = async function (): Promise<Sqlite3Static> {
    log("Loading and initializing SQLite3 module...")
    return new Promise((resolve, reject) => {
      sqlite3InitModule({
        print: log,
        printErr: error,
      }).then((sqlite3) => {
        try {
          log("Running SQLite3 version", sqlite3.version.libVersion)
          if (sqlite3.capi.sqlite3_vfs_find("opfs")) {
            log("opfs vfs found")
          }
          resolve(sqlite3)
        } catch (err: any) {
          error(err.name, err.message)
          reject(err)
        }
      })
    })
  }

  async init() {
    this.sqlite3 = await this.getSQLite3()
  }

  db(props: { path: string; flags: string; vfs?: any; name: string }) {
    const { name, flags, vfs, path } = props
    if (!this.sqlite3) {
      throw new Error("sqlite3 not initialized")
    }
    // const db = new this.sqlite3.oo1.DB(name, flags, vfs)
    const db = new this.sqlite3.oo1.OpfsDb(path, flags)
    return new DataSpace(db, this.config.experiment.undoRedo, name)
  }
}

export class DataSpace {
  db: Database
  undoRedoManager: SQLiteUndoRedo
  activeUndoManager: boolean
  dbName: string
  constructor(db: Database, activeUndoManager: boolean, dbName: string) {
    this.db = db
    this.initMetaTable()
    this.dbName = dbName
    this.undoRedoManager = new SQLiteUndoRedo(this)
    this.activeUndoManager = activeUndoManager
    if (activeUndoManager) {
      this.activeAllTablesUndoRedo()
    }
  }

  private initMetaTable() {
    this.exec(`
    --- sidebar-tree
    CREATE TABLE IF NOT EXISTS ${TreeTableName} (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT
    );
    --- ui column definition
    CREATE TABLE IF NOT EXISTS ${ColumnTableName} (
      name TEXT,
      type TEXT,
      table_name TEXT,
      table_column_name TEXT,
      property TEXT
    );`)
  }

  // update doc mount on sqlite for now,maybe change to fs later
  public async updateDoc(docId: string, content: string) {
    await updateDocFile(this.dbName, docId, content)
  }

  public async getDoc(docId: string) {
    return await getDocContent(this.dbName, docId)
  }

  public async deleteDoc(docId: string) {
    await deleteDocFile(this.dbName, docId)
  }

  // FIXME: there are some problem with headless lexical run in worker
  // return markdown string, compute in worker
  // public async asyncGetDocMarkdown(docId: string) {
  //   return await getDocMarkdown(this.dbName, docId)
  // }

  // return object array
  public async exec2(sql: string, bind: any[] = []) {
    const res: any[] = []
    this.db.exec({
      sql,
      bind,
      returnValue: "resultRows",
      rowMode: "object",
      callback: (row) => {
        res.push(row)
      },
    })
    return res
  }

  public async listAllNodes() {
    return this.exec2(`SELECT * FROM ${TreeTableName};`)
  }
  public async listUiColumns(tableName: string) {
    return this.exec2(`SELECT * FROM ${ColumnTableName} WHERE table_name=?;`, [
      tableName,
    ])
  }

  /**
   * this will return all ui columns in this space
   * @param tableName
   * @returns
   */
  public async listAllUiColumns() {
    return this.exec2(`SELECT * FROM ${ColumnTableName} ;`)
  }

  public undo() {
    if (!this.activeUndoManager) {
      throw new Error("undoRedo not active")
    }
    this.undoRedoManager.callUndo()
  }

  public redo() {
    if (!this.activeUndoManager) {
      throw new Error("undoRedo not active")
    }
    this.undoRedoManager.callRedo()
  }

  private async activeAllTablesUndoRedo() {
    const allTables = await this
      .sql`SELECT name FROM sqlite_master WHERE type='table';`
    // [undefined] why?
    const tables = allTables.map((item) => item[0])?.filter(Boolean)
    logger.info(tables)
    if (!tables) {
      return
    }
    this.undoRedoManager.activate(tables)
  }

  public execute(sql: string, bind: any[] = []) {
    const res: any[] = []
    this.db.exec({
      sql,
      bind,
      callback: (row) => {
        res.push(row)
      },
    })

    return {
      fetchone: () => res[0],
      fetchall: () => res,
    }
  }

  // just execute, no return
  public exec(sql: string, bind: any[] = []) {
    this.db.exec({
      sql,
      bind,
      callback: (row) => {
        // logger.info(row)
      },
    })
  }

  private execSqlWithBind(
    sql: string,
    bind: any[] = [],
    rowMode: "object" | "array" = "array"
  ) {
    const res: any[] = []
    try {
      this.db.exec({
        sql,
        bind,
        returnValue: "resultRows",
        rowMode,
        callback: (row) => {
          res.push(row)
        },
      })
    } catch (error: any) {
      logger.error(error)
      logger.info({ sql, bind })
      postMessage({
        type: MsgType.Error,
        data: {
          message: error.message,
          context: {
            sql,
            bind,
          },
        },
      })
      throw error
    }
    return res
  }

  /**
   * it's a template string function, to execute sql. safe from sql injection
   * table name and column name need to be Symbol, like Symbol('table_name') or Symbol('column_name')
   *
   * example:
   * const tableName = "books"
   * const id = 42
   * sql`select ${Symbol("title")} from ${Symbol('table_name')} where id = ${id}`.then(logger.info)
   * @param strings
   * @param values
   * @returns
   */
  public async sql(strings: TemplateStringsArray, ...values: any[]) {
    const { sql, bind } = buildSql(strings, ...values)
    const res = this.execSqlWithBind(sql, bind)
    // when sql will update database, call event
    if (!isReadOnlySql(sql)) {
      // delay trigger event
      setTimeout(() => this.undoRedoManager.event(), 0)
    }
    return res
  }

  // just for type check
  public sql2 = this.sql

  /**
   * Symbol can't be transformed between main thread and worker thread.
   * so we need to parse sql in main thread, then call this function. it will equal to call `sql` function in worker thread
   * be careful, it just parse sql before, the next logic need to be same with `sql` function
   * @param sql
   * @param bind
   * @returns
   */
  public async sql4mainThread(
    sql: string,
    bind: any[] = [],
    rowMode: "object" | "array" = "array"
  ) {
    const res = this.execSqlWithBind(sql, bind, rowMode)
    // when sql will update database, call event
    if (!isReadOnlySql(sql)) {
      // delay trigger event
      setTimeout(() => this.undoRedoManager.event(), 30)
    }
    return res
  }

  // return object array
  public async sql4mainThread2(sql: string, bind: any[] = []) {
    return this.execSqlWithBind(sql, bind, "object")
  }

  public onUpdate() {
    postMessage({
      type: MsgType.DataUpdateSignal,
      data: {
        database: this.dbName,
      },
    })
    console.log("onUpdate")
  }

  public async withTransaction(fn: Function) {
    this.db.exec("BEGIN TRANSACTION;")
    await fn()
    this.db.exec("COMMIT;")
  }
}
