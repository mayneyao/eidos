import sqlite3InitModule, { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm';

const log = console.log
const error = console.error

export class SqlDatabase {
  db: Database

  constructor(db: Database) {
    this.db = db;
  }

  private async exec(sql: string, bind: any[] = []) {
    this.db.exec({
      sql,
      bind,
      callback: (row) => {
        console.log(row)
      }
    })
  }

  public async sql(strings: TemplateStringsArray, ...values: any[]) {
    const sql = strings.reduce((prev, curr, i) => {
      return prev + curr + (values[i] || '')
    }, '')
    console.log(sql)
    const res: any[] = []
    this.db.exec({
      sql,
      // returnValue: 'resultRows',
      callback: (row) => {
        res.push(row)
      }
    })
    return res;
  }
}

export class Sqlite {
  sqlite3?: Sqlite3Static

  get getSqlite3() {
    return new Sqlite()
  }

  constructor() {

  }

  getSQLite3 = async function (): Promise<Sqlite3Static> {
    log('Loading and initializing SQLite3 module...');
    return new Promise((resolve, reject) => {
      sqlite3InitModule({
        print: log,
        printErr: error,
      }).then((sqlite3) => {
        try {
          log('Done initializing. Running demo...');
          log('Running SQLite3 version', sqlite3.version.libVersion);
          if (sqlite3.capi.sqlite3_vfs_find("opfs")) {
            log('opfs vfs found');
          }
          resolve(sqlite3);
        } catch (err: any) {
          error(err.name, err.message);
          reject(err);
        }
      });
    });
  }

  async init() {
    this.sqlite3 = await this.getSQLite3();
  }

  db(name: string, flags: string, vfs?: any) {
    if (!this.sqlite3) {
      throw new Error('sqlite3 not initialized')
    }
    // const db = new this.sqlite3.oo1.DB(name, flags, vfs)
    const db = new this.sqlite3.oo1.OpfsDb(name, flags);
    return new SqlDatabase(db)
  }
}



let _db: SqlDatabase | null = null

async function main() {
  const sqlite = new Sqlite()
  await sqlite.init()
  _db = sqlite.db('/mytest.sqlite3', 'c')
  postMessage('init')
}

main()

onmessage = async (e) => {
  const { method, params, id } = e.data;
  if (!_db) {
    throw new Error('db not init')
  }
  const _method = method as keyof SqlDatabase
  const callMethod = (_db[_method] as Function).bind(_db)
  const res = await callMethod(...params)
  postMessage({
    id,
    result: res
  })
}
