import { Database } from "@sqlite.org/sqlite-wasm"

import { MsgType } from "@/lib/const"
import { logger } from "@/lib/log"
import { ColumnTableName, TodoTableName } from "@/lib/sqlite/const"
import { buildSql, isReadOnlySql } from "@/lib/sqlite/helper"

import { ActionTable } from "./meta_table/action"
import { DocTable } from "./meta_table/doc"
import { ITreeNode, TreeTable } from "./meta_table/tree"
import { SQLiteUndoRedo } from "./sql_undo_redo_v2"

export class DataSpace {
  db: Database
  undoRedoManager: SQLiteUndoRedo
  activeUndoManager: boolean
  dbName: string
  //  meta table
  doc: DocTable
  action: ActionTable
  tree: TreeTable
  constructor(db: Database, activeUndoManager: boolean, dbName: string) {
    this.db = db
    this.initMetaTable()
    this.dbName = dbName
    this.undoRedoManager = new SQLiteUndoRedo(this)
    this.doc = new DocTable(this)
    this.action = new ActionTable(this)
    this.tree = new TreeTable(this)
    this.activeUndoManager = activeUndoManager
    if (activeUndoManager) {
      this.activeAllTablesUndoRedo()
    }
  }

  private initMetaTable() {
    this.exec(`
    --- ui column definition
    CREATE TABLE IF NOT EXISTS ${ColumnTableName} (
      name TEXT,
      type TEXT,
      table_name TEXT,
      table_column_name TEXT,
      property TEXT
    );

    --- todo list
    CREATE TABLE IF NOT EXISTS ${TodoTableName} (
      content TEXT,
      done BOOLEAN,
      doc_id TEXT,
      list_id TEXT,
      node_key TEXT
    );`)
  }

  // actions
  public async addAction(data: any) {
    await this.action.add(data)
  }

  public async listActions() {
    return this.action.list()
  }

  public async addDoc(docId: string, content: string, isDayPage = false) {
    await this.doc.add({ id: docId, content, isDayPage })
  }

  // update doc mount on sqlite for now,maybe change to fs later
  public async updateDoc(docId: string, content: string, isDayPage = false) {
    const res = await this.doc.get(docId)
    if (!res) {
      await this.doc.add({ id: docId, content, isDayPage })
    } else {
      await this.doc.set(docId, { id: docId, content })
    }
  }

  public async getDoc(docId: string) {
    const doc = await this.doc.get(docId)
    return doc?.content
  }

  // public async renameDoc(docId: string, newName: string) {
  //   await opfsDocManager.renameDocFile(
  //     ["spaces", this.dbName, "docs", `${docId}.md`],
  //     `${newName}.md`
  //   )
  // }
  public async deleteDoc(docId: string) {
    await this.doc.del(docId)
  }

  public async listDays(page: number) {
    return await this.doc.listDayPage(page)
  }

  public async listAllDays() {
    return await this.doc.listAllDayPages()
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

  public async listTreeNodes(q?: string, withSubNode?: boolean) {
    return this.tree.list(q, withSubNode)
  }

  public async addTreeNode(data: ITreeNode) {
    return this.tree.add(data)
  }

  public async getTreeNode(id: string) {
    return this.tree.get(id)
  }

  public async listUiColumns(tableName: string) {
    const cols = await this.exec2(
      `SELECT * FROM ${ColumnTableName} WHERE table_name=?;`,
      [tableName]
    )
    return cols.filter((col) => !col.name.startsWith("_"))
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
