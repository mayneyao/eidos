import { Database } from "@sqlite.org/sqlite-wasm"

import { MsgType } from "@/lib/const"
import { logger } from "@/lib/log"
import { ColumnTableName } from "@/lib/sqlite/const"
import { buildSql, isReadOnlySql } from "@/lib/sqlite/helper"
import { extractIdFromShortId, getRawTableNameById } from "@/lib/utils"
import { IUIColumn } from "@/hooks/use-table"

import { ActionTable } from "./meta_table/action"
import { BaseTable } from "./meta_table/base"
import { ColumnTable } from "./meta_table/column"
import { DocTable } from "./meta_table/doc"
import { EmbeddingTable } from "./meta_table/embedding"
import { ITreeNode, TreeTable } from "./meta_table/tree"
import { IView, ViewTable } from "./meta_table/view"
import { SQLiteUndoRedo } from "./sql_undo_redo_v2"
import { DataChangeTrigger } from "./trigger/data_change_trigger"
import { ALL_UDF } from "./udf"

export class DataSpace {
  db: Database
  undoRedoManager: SQLiteUndoRedo
  activeUndoManager: boolean
  dbName: string
  //  meta table
  doc: DocTable
  action: ActionTable
  tree: TreeTable
  view: ViewTable
  column: ColumnTable
  embedding: EmbeddingTable
  dataChangeTrigger: DataChangeTrigger
  allTables: BaseTable<any>[] = []
  constructor(db: Database, activeUndoManager: boolean, dbName: string) {
    this.db = db
    this.dbName = dbName
    this.initUDF()
    this.dataChangeTrigger = new DataChangeTrigger()
    this.doc = new DocTable(this)
    this.action = new ActionTable(this)
    this.tree = new TreeTable(this)
    this.view = new ViewTable(this)
    this.column = new ColumnTable(this)
    this.embedding = new EmbeddingTable(this)
    //
    this.allTables = [
      this.doc,
      this.action,
      this.tree,
      this.view,
      this.column,
      this.embedding,
    ]

    this.initMetaTable()
    this.undoRedoManager = new SQLiteUndoRedo(this)
    this.activeUndoManager = activeUndoManager
    if (activeUndoManager) {
      this.activeAllTablesUndoRedo()
    }
  }

  private initUDF() {
    ALL_UDF.forEach((udf) => {
      this.db.createFunction(udf)
    })
  }
  private initMetaTable() {
    this.allTables.forEach((table) => {
      this.exec(table.createTableSql)
    })
  }

  // table change callback
  public async onTableChange(
    space: string,
    tableName: string,
    toDeleteColumns?: string[]
  ) {
    if (space === this.dbName) {
      const collist = await this.listRawColumns(tableName)
      await this.dataChangeTrigger.setTrigger(
        this,
        tableName,
        collist,
        toDeleteColumns
      )
    }
  }

  // views
  public async listViews(tableId: string) {
    return await this.view.list(tableId)
  }

  public async addView(view: IView) {
    return await this.view.add(view)
  }

  public async delView(viewId: string) {
    return await this.view.del(viewId)
  }

  public async updateView(viewId: string, view: Partial<IView>) {
    return await this.view.set(viewId, view)
  }

  public async createDefaultView(tableId: string) {
    return await this.view.createDefaultView(tableId)
  }

  // columns
  public async addColumn(data: IUIColumn) {
    return await this.column.add(data)
  }

  public async listRawColumns(tableName: string) {
    return await this.db.selectObjects(`PRAGMA table_info(${tableName})`)
  }

  public async updateColumnProperty(data: {
    tableName: string
    tableColumnName: string
    property: any
    isFormula?: boolean
  }) {
    return await this.column.updateProperty(data)
  }

  // actions
  public async addAction(data: any) {
    await this.action.add(data)
  }

  public async listActions() {
    return this.action.list()
  }

  // docs
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

  public async getDocMarkdown(docId: string) {
    return this.doc.getMarkdown(docId)
  }

  /**
   * if you want to create or update a day page, you should pass a day page id. page id is like 2021-01-01
   * @param docId
   * @param mdStr
   * @returns
   */
  public async createOrUpdateDocWithMarkdown(docId: string, mdStr: string) {
    return this.doc.createOrUpdateWithMarkdown(docId, mdStr)
  }

  public async deleteDoc(docId: string) {
    await this.doc.del(docId)
  }

  public async createTable(id: string, name: string, tableSchema: string) {
    this.withTransaction(async () => {
      this.addTreeNode({ id, name, type: "table" })
      await this.sql`${tableSchema}`
      // create view for table
      await this.createDefaultView(id)
    })
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

  // tree
  public async listTreeNodes(q?: string, withSubNode?: boolean) {
    return this.tree.list(q, withSubNode)
  }

  public async pinNode(id: string, isPinned: boolean) {
    return this.tree.pin(id, isPinned)
  }

  public async updateTreeNodeName(id: string, name: string) {
    const node = await this.tree.get(id)
    if (node?.name === name) {
      return
    }
    return this.withTransaction(async () => {
      await this.tree.updateName(id, name)
      // if this node is subDoc, we need to update row.title
      if (node?.parentId) {
        const parent = await this.tree.get(node.parentId)
        if (parent && parent.type === "table") {
          const tableRawName = getRawTableNameById(parent.id)
          await this.exec2(
            `UPDATE ${tableRawName} SET title = ? WHERE _id = ?`,
            [name, extractIdFromShortId(id)]
          )
        }
      }
    })
  }

  public async addTreeNode(data: ITreeNode) {
    return this.tree.add(data)
  }

  public async getTreeNode(id: string) {
    return this.tree.get(id)
  }

  public async moveDraftIntoTable(id: string, tableId: string) {
    return this.tree.moveIntoTable(id, tableId)
  }

  public async listUiColumns(tableName: string) {
    return this.column.list(tableName)
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
    console.log(sql, bind)
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
    console.log(sql, bind)
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

  // rename for public rpc
  public sqlQuery = this.sql4mainThread
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
    // TODO: use this.db.transaction replace
    try {
      this.db.exec("BEGIN TRANSACTION;")
      await fn()
      this.db.exec("COMMIT;")
    } catch (error) {
      this.db.exec("ROLLBACK;")
      throw error
    }
  }
}
