import sqlite3InitModule, { Sqlite3Static } from "@sqlite.org/sqlite-wasm"

import { logger } from "@/lib/log"
import { getConfig } from "@/lib/storage/indexeddb"
import { ExperimentFormValues } from "@/app/settings/experiment/store"

import { DataSpace } from "./DataSpace"

const log = logger.info
const error = logger.error

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

  async draftDb() {
    if (!this.sqlite3) {
      throw new Error("sqlite3 not initialized")
    }
    const db = new this.sqlite3.oo1.DB(":memory:", "c")
    return new DataSpace(db, false, "draft", this.sqlite3)
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
    // console.log("config.experiment.undoRedo", config.experiment.undoRedo)
    return new DataSpace(
      db,
      Boolean(draftDb && config.experiment.undoRedo),
      name,
      this.sqlite3,
      draftDb
    )
  }
}
