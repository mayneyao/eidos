import sqlite3InitModule, { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm';

const log = console.log
const error = console.error

export const getSQLite3 = async function (): Promise<Sqlite3Static> {
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

class SqlDatabase {
  db: Database
  constructor(db: Database) {
    this.db = db;
  }

  async exec(sql: string, bind: any[] = []) {
    this.db.exec({
      sql,
      bind,
      callback: (row) => {
        console.log(row)
      }
    })
  }

  async query(sql: string, bind: any[] = []) {
    console.log(sql, bind)

  }

  async sql(strings: TemplateStringsArray, ...values: any[]) {
    const sql = strings.map((s, i) => s + (values[i] || '')).join('');
    const res: any[] = []
    this.db.exec({
      sql,
      returnValue: 'resultRows',
      callback: (row) => {
        res.push(row)
      }
    })
    return res;
  }
}

export class Sqlite {
  sqlite3: Sqlite3Static
  constructor(sqlite3: Sqlite3Static) {
    this.sqlite3 = sqlite3;
    console.log(sqlite3)
  }

  db(name: string, flags: string, vfs?: any) {
    // const db = new this.sqlite3.oo1.DB(name, flags, vfs)
    const db = new this.sqlite3.oo1.OpfsDb(name, flags);
    return new SqlDatabase(db)
  }
}

export const initDemoData = async function () {
  const sqlite3 = await getSQLite3();
  const db = new Sqlite(sqlite3).db('/mydb.sqlite3', 'c');
  log('Creating a table...');
  const table = await db.exec('CREATE TABLE IF NOT EXISTS t(a,b)');
  console.log(table)
  log('Insert some data using exec()...');
  for (let i = 20; i <= 25; ++i) {
    db.exec('INSERT INTO t(a,b) VALUES (?,?)', [i, i * 2]);
  }
  log('Query data with exec()...');
  const res = await db.sql`SELECT a FROM t`;
  console.log(res)
}

onmessage = (e) => {
  console.log("Message received from main script");
  const workerResult = `Result: ${e.data[0] * e.data[1]}`;
  initDemoData()
  console.log("Posting message back to main script");
  postMessage(workerResult);
};
