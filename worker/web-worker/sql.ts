import sqlite3InitModule, { Sqlite3Static } from "@sqlite.org/sqlite-wasm"

import { ExperimentFormValues } from "@/apps/web-app/settings/experiment/store"
import { logger } from "@/lib/env"
import { getConfig } from "@/lib/storage/indexeddb"

import { DataSpace, EidosDatabase } from "./DataSpace"

const log = logger.info
const error = logger.error

export class Sqlite {
  sqlite3?: Sqlite3Static
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

  async draftDb() {
    if (!this.sqlite3) {
      throw new Error("sqlite3 not initialized")
    }
    const db = new this.sqlite3.oo1.DB(":memory:", "c")
    return new DataSpace({
      db,
      activeUndoManager: false,
      dbName: "draft",
      sqlite3: this.sqlite3,
      context: {
        setInterval: setInterval,
      },
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

    const config = await getConfig<{ experiment: ExperimentFormValues }>(
      "config-experiment"
    )

    async function createUDF(db: EidosDatabase) {
      const globalKv = new Map()
      // udf
      const scripts = await db.selectObjects(
        `SELECT DISTINCT name, code FROM eidos__scripts WHERE type = 'udf' AND enabled = 1`
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

    // console.log("config.experiment.undoRedo", config.experiment.undoRedo)
    return new DataSpace({
      db,
      activeUndoManager: Boolean(draftDb && config.experiment.undoRedo),
      dbName: name,
      sqlite3: this.sqlite3,
      draftDb,
      createUDF,
      context: {
        setInterval: setInterval,
      },
    })
  }
}
