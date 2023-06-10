import { SqlDatabase } from './sql';

interface StackEntry {
  begin: number;
  end: number;
}

interface UndoRedoState {
  active: boolean;
  undostack: StackEntry[];
  redostack: StackEntry[];
  pending?: any;
  firstlog: number;
  freeze?: number;
  startstate?: unknown;
}

export class SQLiteUndoRedo {
  undo: UndoRedoState
  db: SqlDatabase
  constructor(db: SqlDatabase) {
    this.db = db;
    this.undo = {
      active: false,
      undostack: [],
      redostack: [],
      firstlog: 1,
    };
  }
  public activate(tables: string[]): void {
    if (this.undo.active) return;
    this.createTriggers(this.db, tables);
    this.undo.active = true;
    this.undo.undostack = [];
    this.undo.redostack = [];
    this.undo.freeze = -1;
    this._start_interval();
  }

  public deactivate(): void {
    if (!this.undo.active) return;

    this._drop_triggers();
    this.undo.undostack = [];
    this.undo.redostack = [];
    this.undo.active = false;
    this.undo.freeze = -1;
  }

  public freeze(): void {
    if (!this.undo.freeze) return;

    if (this.undo.freeze >= 0)
      throw new Error("recursive call to SQLiteUndoRedo.freeze");

    this.undo.freeze = this.db?.execute(
      "SELECT coalesce(max(seq),0) FROM undolog"
    ).fetchone()[0];
  }

  public unfreeze(): void {
    if (!this.undo.freeze) return;
    if (this.undo.freeze < 0)
      throw new Error("called unfreeze while not frozen");

    this.db.exec(`DELETE FROM undolog WHERE seq > ?`, [this.undo.freeze]);
    this.undo.freeze = -1;
  }

  public event(): void {
    if (!this.undo.pending) {
      this.undo.pending = setTimeout(() => this.barrier());
    }
  }

  public async barrier() {
    setTimeout(this.undo.pending!)
    this.undo.pending = undefined;

    if (!this.undo.active) {
      this.refresh();
      return;
    }

    let end = this.db.execute(
      "SELECT coalesce(max(seq),0) FROM undolog"
    ).fetchone()[0];

    if (this.undo.freeze && end > this.undo.freeze) {
      end = this.undo.freeze;
    }
    const begin = this.undo.firstlog;
    this._start_interval();
    if (begin === this.undo.firstlog) {
      this.refresh();
      return;
    }
    this.undo.undostack.push({ begin, end: this.undo.firstlog });
    console.log(this.undo.undostack, { begin, end: this.undo.firstlog })
    this.undo.redostack = [];
    this.refresh();
  }

  public callUndo(): void {
    console.log('undo')
    this._step(this.undo.undostack, this.undo.redostack);
  }

  public callRedo(): void {
    this._step(this.undo.redostack, this.undo.undostack);
  }

  public refresh(): void {
    console.log('refresh')
    // this.db.onUpdate();
  }

  public reload_all(): void {
    const body: string[] = [];
    console.log('not implemented, but should be')
    // for (const ns in global) {
    //   if (Object.prototype.hasOwnProperty.call(global, ns)) {
    //     const fn = global[ns]?.reload;
    //     if (ns !== "SQLiteUndoRedo" && typeof fn === "function") {
    //       body.push(`${ns}.reload();`);
    //     }
    //   }
    // }
    // eval(body.join("\n"));
  }

  private async _makeTriggersForTbl(db: SqlDatabase, tbl: string) {
    const collist = await db.sql`pragma table_info(${tbl})`;
    let sql = `CREATE TEMP TRIGGER _${tbl}_it AFTER INSERT ON ${tbl} BEGIN\n`;
    sql += '  INSERT INTO undolog VALUES(NULL,';
    sql += `\'DELETE FROM ${tbl} WHERE rowid=\'||new.rowid);\nEND;\n`;

    sql += `CREATE TEMP TRIGGER _${tbl}_ut AFTER UPDATE ON ${tbl} BEGIN\n`;
    sql += '  INSERT INTO undolog VALUES(NULL,';
    sql += `\'UPDATE ${tbl} `;
    let sep = 'SET ';
    for (const column of collist) {
      const name = column[1];
      sql += `${sep}${name}=\'||quote(old.${name})||\'`;
      sep = ',';
    }
    sql += ` WHERE rowid=\'||old.rowid);\nEND;\n`;

    // delete trigger
    sql += `CREATE TEMP TRIGGER _${tbl}_dt BEFORE DELETE ON ${tbl} BEGIN\n`;
    sql += '  INSERT INTO undolog VALUES(NULL,';
    sql += `\'INSERT INTO ${tbl}(rowid`;
    for (const column of collist) {
      const name = column[1];
      sql += `,${name}`;
    }
    //  WARN: use || to connect strings rather than + to avoid number conversion
    sql += `) VALUES(\'||old.rowid||\'`;
    for (const column of collist) {
      const name = column[1];
      sql += `,\'||quote(old.${name})||\'`;
    }
    sql += `)\');\nEND;\n`;
    console.log(`Creating triggers for ${tbl}`, sql)
    return sql
  }

  private async createTriggers(db: SqlDatabase, tables: string[]) {
    try {
      db.exec('DROP TABLE IF EXISTS undolog');
    } catch (err) {
      // Ignore error if undolog table does not exist
    }
    db.exec('CREATE TEMP TABLE undolog(seq integer primary key, sql text)');
    for (const tbl of tables) {
      try {
        const sql = await this._makeTriggersForTbl(db, tbl);
        db.exec(sql);
      } catch (error) {
        console.log(`Error creating triggers for ${tbl}`, error)
      }
    }
  }
  private _drop_triggers(): void {
    console.log('not implemented, but should be')
    // const tables = this.db?.all(
    //   `SELECT DISTINCT tbl_name FROM sqlite_master WHERE type='trigger' AND name LIKE '_%_%'`
    // )!;

    // for (const { tbl_name } of tables) {
    //   this.db.exec(`DROP TRIGGER _${tbl_name}_it`);
    //   this.db.exec(`DROP TRIGGER _${tbl_name}_ut`);
    //   this.db.exec(`DROP TRIGGER _${tbl_name}_dt`);
    // }
  }

  private _start_interval(): void {
    const begin = this.db.execute(
      "SELECT coalesce(max(seq),0)+1 FROM undolog").fetchone()[0]
    if (begin > this.undo.firstlog) {
      this.undo.firstlog = begin;
      this.undo.redostack = [];
      this.undo.undostack = [];
    }
  }

  private _step(from: StackEntry[], to: StackEntry[]): void {
    if (from.length === 0) return;
    const { begin, end } = from.pop()!;
    this.undo.freeze = end;
    const q1 = `SELECT sql FROM undolog WHERE seq>=${begin} AND seq<=${end} ORDER BY seq DESC`;
    const rows = this.db.execute(q1).fetchall();
    const sql = rows.map((row) => row[0]).join(';\n');
    this.db.exec(sql);
    to.push({ begin, end });
    this._start_interval()
    this.refresh();
    console.log(
      this.undo.undostack,
      this.undo.redostack,
    )
  }
}


/**
 * init: 1row. action: add 2
 * undo stack = [delete 2]
 * redo stack = []
 * 
 * call undo -> delete 2 -> state: 1 row
 * undo stack = []
 * redo stack = [add 2]
 * 
 */

