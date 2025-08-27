import type { Database, Sqlite3Static } from "@sqlite.org/sqlite-wasm"
import sqlite3InitModule from "@sqlite.org/sqlite-wasm"

import { logger } from "@/lib/env"

import { EidosDataEventChannelName } from "@/lib/const"
import type { BaseServerDatabase } from "@/packages/core/sqlite/interface"
import { DataSpace } from "@/packages/core/DataSpace"
import { ExtensionTableName } from "@/packages/core/sqlite/const"

const log = logger.info
const error = logger.error

// SQLiteWasmDatabase implements BaseServerDatabase for sqlite-wasm
export class SQLiteWasmDatabase implements BaseServerDatabase {
  filename?: string;
  private db: Database; // Using any for now to avoid type issues

  constructor(db: Database) {
    this.db = db;
    this.filename = db.filename;
  }

  get isWalMode() {
    return true;
  }

  pages(): Promise<{ [key: string]: any; }> {
    return Promise.resolve({});
  }

  status(): Promise<{ [key: string]: any; }> {
    return Promise.resolve({});
  }

  pull(): Promise<{ [key: string]: any; }> {
    return Promise.resolve({});
  }

  push(): Promise<{ [key: string]: any; }> {
    return Promise.resolve({});
  }

  reset(): Promise<{ [key: string]: any; }> {
    return Promise.resolve({});
  }

  prepare(sql: string) {
    const stmt = this.db.prepare(sql)
    return {
      run: (bind?: any[]) => {
        if (bind != null) {
          stmt.bind(bind)
        }
        stmt.step()
        stmt.reset()
      },
      all: (bind?: any[]) => {
        if (bind != null) {
          stmt.bind(bind)
        }
        const results: any[] = []
        while (stmt.step()) {
          results.push(stmt.get({}))
        }
        stmt.reset()
        return Promise.resolve(results);
      }
    }
  }

  close(): void {
    this.db.close();
  }

  async selectObjects(sql: string, bind?: any[]): Promise<{ [columnName: string]: any }[]> {
    const rows = this.db.selectObjects(sql, bind);
    return rows;
  }

  transaction(func: (db: BaseServerDatabase) => void): any {
    try {
      this.db.exec("BEGIN");
      func(this as BaseServerDatabase);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  async exec(opts: string | {
    sql: string;
    bind?: any[];
    rowMode?: "array" | "object";
    returnValue?: "resultRows" | "saveSql";
  }): Promise<any> {
    if (typeof opts === 'string') {
      return this.db.exec(opts);
    }

    let rowMode = opts.rowMode || "array"
    if (rowMode === "array") {
      return this.db.selectArrays(opts.sql, opts.bind);
    }
    if (rowMode === "object") {
      return this.db.selectObjects(opts.sql, opts.bind);
    }
    throw new Error("Invalid rowMode");
  }

  createFunction(opt: { name: string; xFunc: (...args: any[]) => any }): any {
    return this.db.createFunction(opt);
  }
}

export class SqliteServer {
  sqlite3?: Sqlite3Static

  // Create a BaseServerDatabase implementation from a sqlite-wasm database
  // db parameter is actually sqlite3.oo1.OpfsDb or sqlite3.oo1.DB type
  static createServerDatabase(db: Database): BaseServerDatabase {
    return new SQLiteWasmDatabase(db);
  }

  constructor() { }

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

  // Example of how to use the BaseServerDatabase implementation
  async createServerDatabase(path: string, flags: string = "c"): Promise<BaseServerDatabase> {
    if (!this.sqlite3) {
      throw new Error("sqlite3 not initialized")
    }
    const rawDb = new this.sqlite3.oo1.OpfsDb(path, flags)
    // enable foreign key
    rawDb.exec(`PRAGMA foreign_keys = ON;`)

    // Create a server database implementation
    return SqliteServer.createServerDatabase(rawDb)
  }

  async draftDb() {
    if (!this.sqlite3) {
      throw new Error("sqlite3 not initialized")
    }
    const db = new this.sqlite3.oo1.DB(":memory:", "c")
    const _draftDb = SqliteServer.createServerDatabase(db)

    return new DataSpace({
      db: _draftDb,
      activeUndoManager: false,
      dbName: "draft",
      context: {
        setInterval: setInterval,
      },
      dataEventChannel: new BroadcastChannel(`${EidosDataEventChannelName}-draft`),
      isUDFWithCtx: true
    })
  }


  async db(props: {
    path: string
    flags: string
    vfs?: any
    name: string
    draftDb?: DataSpace
  }) {
    const { name, flags, vfs, path, draftDb } = props
    if (!this.sqlite3) {
      throw new Error("sqlite3 not initialized")
    }
    // const db = new this.sqlite3.oo1.DB(name, flags, vfs)
    const db = new this.sqlite3.oo1.OpfsDb(path, flags)
    // enable foreign key
    db.exec(`PRAGMA foreign_keys = ON;`)


    async function createUDF(db: BaseServerDatabase) {
      const globalKv = new Map()
      
      // Check if ExtensionTableName table exists before querying it
      const tableExists = await db.selectObjects(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [ExtensionTableName]
      )
      
      if (tableExists.length === 0) {
        console.warn(`Extension table ${ExtensionTableName} does not exist. Skipping UDF creation.`)
        return
      }
      
      // udf
      const scripts = await db.selectObjects(
        `SELECT DISTINCT name, code FROM ${ExtensionTableName} WHERE type = 'udf' AND enabled = 1`
      )
      scripts.forEach((script) => {
        const { code, name } = script
        globalKv.set(name, new Map())
        try {
          const func = new Function("kv", ("return " + code) as string)
          const udf = {
            name: name as string,
            xFunc: func(globalKv.get(name)),
            deterministic: true,
          }
          db.createFunction(udf)
        } catch (error) {
          console.error(error)
        }
      })
    }

    const serverDb = SqliteServer.createServerDatabase(db)
    // console.log("config.experiment.undoRedo", config.experiment.undoRedo)
    return new DataSpace({
      db: serverDb,
      activeUndoManager: false,
      dbName: name,
      draftDb,
      createUDF,
      context: {
        setInterval: setInterval,
      },
      dataEventChannel: new BroadcastChannel(EidosDataEventChannelName),
      isUDFWithCtx: true
    })
  }
}
