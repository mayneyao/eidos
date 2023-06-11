import sqlite3InitModule, {
  Database,
  Sqlite3Static,
} from "@sqlite.org/sqlite-wasm"

import { logger } from "@/lib/log"
import { buildSql, isReadOnlySql } from "@/lib/sqlite/helper"

import { SQLiteUndoRedo } from "./sql_undo_redo_v2"

const log = logger.info
const error = logger.error
const debug = logger.debug

// current DB
let _db: SqlDatabase | null = null

export class SqlDatabase {
  db: Database
  undoRedoManager: SQLiteUndoRedo
  constructor(db: Database) {
    this.db = db
    this.undoRedoManager = new SQLiteUndoRedo(this)
    this.activeAllTablesUndoRedo()
  }

  public undo() {
    debug("undo")
    this.undoRedoManager.callUndo()
  }

  public redo() {
    debug("redo")
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

  private execSqlWithBind(sql: string, bind: any[] = []) {
    const res: any[] = []
    try {
      this.db.exec({
        sql,
        bind,
        // returnValue: 'resultRows',
        callback: (row) => {
          res.push(row)
        },
      })
    } catch (error) {
      logger.error(error)
      logger.info({ sql, bind })
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

  /**
   * Symbol can't be transformed between main thread and worker thread.
   * so we need to parse sql in main thread, then call this function. it will equal to call `sql` function in worker thread
   * be careful, it just parse sql before, the next logic need to be same with `sql` function
   * @param sql
   * @param bind
   * @returns
   */
  public async sql4mainThread(sql: string, bind: any[] = []) {
    const res = this.execSqlWithBind(sql, bind)
    // when sql will update database, call event
    if (!isReadOnlySql(sql)) {
      // delay trigger event
      setTimeout(() => this.undoRedoManager.event(), 30)
    }
    return res
  }

  public onUpdate() {
    postMessage({
      type: "update",
      data: {
        database: this.db.filename,
      },
    })
  }
}

export class Sqlite {
  sqlite3?: Sqlite3Static

  constructor() {}

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

  db(name: string, flags: string, vfs?: any) {
    if (!this.sqlite3) {
      throw new Error("sqlite3 not initialized")
    }
    // const db = new this.sqlite3.oo1.DB(name, flags, vfs)
    const db = new this.sqlite3.oo1.OpfsDb(name, flags)
    return new SqlDatabase(db)
  }
}

const sqlite = new Sqlite()

function loadDatabase(dbName: string) {
  const filename = `/${dbName}.sqlite3`
  if (_db?.db.filename === filename) {
    return _db
  }
  const db = sqlite.db(filename, "c")
  log("switchDatabase", dbName)
  return db
}

async function main() {
  await sqlite.init()
  _db = sqlite.db("/mytest.sqlite3", "c")
  postMessage("init")
}

main()

onmessage = async (e) => {
  const { method, params, id, dbName } = e.data
  if (method === "switchDatabase") {
    const dbName = params[0]
    _db = loadDatabase(dbName)
    postMessage({
      id,
      result: {
        msg: "switchDatabase success",
        dbName,
      },
    })
    return
  }
  if (!sqlite.sqlite3) {
    throw new Error("sqlite3 not initialized")
  }
  // debug(
  //   `sql query dbName ${dbName}\n currentDBName ${_db?.db.filename}`,
  // )
  if (!_db || (dbName && dbName !== _db.db.filename)) {
    _db = loadDatabase(dbName)
  }
  const _method = method as keyof SqlDatabase
  const callMethod = (_db[_method] as Function).bind(_db)
  const res = await callMethod(...params)
  postMessage({
    id,
    result: res,
  })
}
