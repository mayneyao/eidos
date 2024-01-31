import { Database, Sqlite3Static } from "@sqlite.org/sqlite-wasm"

import { MsgType } from "@/lib/const"
import { FieldType } from "@/lib/fields/const"
import { logger } from "@/lib/log"
import { ColumnTableName } from "@/lib/sqlite/const"
import { buildSql, isReadOnlySql } from "@/lib/sqlite/helper"
import { transformQuery } from "@/lib/sqlite/sql-formula-parser"
import { IField } from "@/lib/store/interface"
import {
  extractIdFromShortId,
  getRawTableNameById,
  getTableIdByRawTableName,
  isDayPageId,
} from "@/lib/utils"

import { ITreeNode } from "../../lib/store/ITreeNode"
import { IView } from "../../lib/store/IView"
import { DataChangeEventHandler } from "./DataChangeEventHandler"
import { DbMigrator } from "./DbMigrator"
import { LinkRelationUpdater } from "./LinkRelationUpdater"
import { ActionTable } from "./meta_table/action"
import { BaseTable } from "./meta_table/base"
import { ColumnTable } from "./meta_table/column"
import { DocTable } from "./meta_table/doc"
import { EmbeddingTable, IEmbedding } from "./meta_table/embedding"
import { FileTable, IFile } from "./meta_table/file"
import { ReferenceTable } from "./meta_table/reference"
import { IScript, ScriptStatus, ScriptTable } from "./meta_table/script"
import { TreeTable } from "./meta_table/tree"
import { ViewTable } from "./meta_table/view"
import { RowsManager } from "./sdk/rows"
import { TableManager } from "./sdk/table"
import { SQLiteUndoRedo } from "./sql_undo_redo_v2"
import { DataChangeTrigger } from "./trigger/data_change_trigger"
import { withSqlite3AllUDF } from "./udf"

export type EidosTable =
  | DocTable
  | ActionTable
  | ScriptTable
  | TreeTable
  | ViewTable
  | ColumnTable
  | EmbeddingTable
  | FileTable

export class DataSpace {
  db: Database
  draftDb: DataSpace | undefined
  sqlite3: Sqlite3Static
  undoRedoManager: SQLiteUndoRedo
  activeUndoManager: boolean
  dbName: string
  //  meta table
  doc: DocTable
  action: ActionTable
  script: ScriptTable
  tree: TreeTable
  view: ViewTable
  column: ColumnTable
  reference: ReferenceTable
  embedding: EmbeddingTable
  file: FileTable
  dataChangeTrigger: DataChangeTrigger
  linkRelationUpdater: LinkRelationUpdater
  allTables: BaseTable<any>[] = []

  // for trigger
  eventHandler: DataChangeEventHandler

  // for auto migration
  hasMigrated = false
  constructor(
    db: Database,
    activeUndoManager: boolean,
    dbName: string,
    sqlite3: Sqlite3Static,
    draftDb?: DataSpace
  ) {
    this.db = db
    this.sqlite3 = sqlite3
    this.draftDb = draftDb
    this.dbName = dbName
    this.initUDF()
    this.eventHandler = new DataChangeEventHandler(this)
    this.dataChangeTrigger = new DataChangeTrigger()
    this.linkRelationUpdater = new LinkRelationUpdater(this)
    this.doc = new DocTable(this)
    this.action = new ActionTable(this)
    this.script = new ScriptTable(this)
    this.tree = new TreeTable(this)
    this.view = new ViewTable(this)
    this.file = new FileTable(this)
    this.column = new ColumnTable(this)
    this.embedding = new EmbeddingTable(this)
    this.reference = new ReferenceTable(this)
    //
    this.allTables = [
      this.doc,
      this.action,
      this.script,
      this.tree,
      this.view,
      this.column,
      this.embedding,
      this.file,
      this.reference,
    ]
    // migration
    if (this.draftDb) {
      const dbMigrator = new DbMigrator(this, this.draftDb)
      dbMigrator.migrate()
      // after migration, enable opfs SyncAccessHandle Pool for better performance
      this.sqlite3.installOpfsSAHPoolVfs({}).then((poolUtil) => {
        console.debug("poolUtil", poolUtil)
      })
    }
    this.initMetaTable()

    // other
    this.undoRedoManager = new SQLiteUndoRedo(this)
    this.activeUndoManager = activeUndoManager
    if (activeUndoManager) {
      this.activeAllTablesUndoRedo()
    }
  }

  // close db
  public closeDb() {
    this.db.close()
  }

  private initUDF() {
    const allUfs = withSqlite3AllUDF(this.sqlite3)
    allUfs.forEach((udf) => {
      this.db.createFunction(udf as any)
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
  // embedding
  public async addEmbedding(embedding: IEmbedding) {
    return await this.embedding.add(embedding)
  }

  // table
  public table(id: string) {
    return new TableManager(id, this)
  }

  public async getLookupContext(tableName: string, columnName: string) {
    const tableId = getTableIdByRawTableName(tableName)
    const tableManager = this.table(tableId)
    return tableManager.fields.lookup.getLookupContext(tableName, columnName)
  }
  public updateLookupColumn(tableName: string, columnName: string) {
    const tableId = getTableIdByRawTableName(tableName)
    const tableManager = this.table(tableId)
    return tableManager.fields.lookup.updateColumn({
      tableName,
      tableColumnName: columnName,
    })
  }

  public deleteSelectOption = async (
    field: IField,
    option: string
  ): Promise<void> => {
    const tableId = getTableIdByRawTableName(field.table_name)
    const tableManager = this.table(tableId)
    if (field.type === FieldType.Select) {
      return await tableManager.fields.select.deleteSelectOption(field, option)
    } else if (field.type === FieldType.MultiSelect) {
      return await tableManager.fields.multiSelect.deleteSelectOption(
        field,
        option
      )
    }
  }
  public updateSelectOptionName = async (
    field: IField,
    update: {
      from: string
      to: string
    }
  ) => {
    const tableId = getTableIdByRawTableName(field.table_name)
    const tableManager = this.table(tableId)
    if (field.type === FieldType.Select) {
      return await tableManager.fields.select.updateSelectOptionName(
        field,
        update
      )
    } else if (field.type === FieldType.MultiSelect) {
      return await tableManager.fields.multiSelect.updateSelectOptionName(
        field,
        update
      )
    }
  }

  public async setRow(tableId: string, rowId: string, data: any) {
    return await this.table(tableId).rows.update(rowId, data, {
      useFieldId: true,
    })
  }

  public async setCell(data: {
    tableId: string
    rowId: string
    fieldId: string
    value: any
  }) {
    const tableManager = this.table(data.tableId)
    const row = await tableManager.rows.get(data.rowId, { raw: true })
    const oldValue = row?.[data.fieldId]

    if (oldValue !== data.value) {
      const tableName = getRawTableNameById(data.tableId)
      const field = await this.column.getColumn(tableName, data.fieldId)
      if (field?.type === FieldType.Link) {
        await tableManager.fields.link.updateCell(
          field,
          data.rowId,
          data.value,
          oldValue
        )
      }
      return await this.table(data.tableId).rows.update(
        data.rowId,
        {
          [data.fieldId]: data.value,
        },
        { useFieldId: true }
      )
    }
  }

  public async getRow(tableId: string, rowId: string) {
    const tableManager = this.table(tableId)
    const row = await tableManager.rows.query(
      {
        _id: rowId,
      },
      {
        limit: 1,
        raw: true,
      }
    )
    if (row.length === 0) {
      return null
    }
    return row[0]
  }

  // files
  public async addFile(file: IFile) {
    return await this.file.add(file)
  }

  public async getFileById(id: string) {
    return await this.file.get(id)
  }

  public async getFileByPath(path: string) {
    return await this.file.getFileByPath(path)
  }

  public async delFile(id: string) {
    return await this.file.del(id)
  }

  public async delFileByPath(path: string) {
    const file = await this.file.getFileByPath(path)
    if (!file) {
      return
    }
    return await this.file.del(file.id)
  }

  public async deleteFileByPathPrefix(prefix: string) {
    return await this.file.deleteFileByPathPrefix(prefix)
  }

  public async updateFileVectorized(id: string, isVectorized: boolean) {
    return await this.file.updateVectorized(id, isVectorized)
  }

  public async saveFile2OPFS(url: string, name?: string) {
    return await this.file.saveFile2OPFS(url, name)
  }

  public async listFiles() {
    return await this.file.list()
  }

  public async walkFiles() {
    return await this.file.walk()
  }

  // views
  public async listViews(tableId: string) {
    return await this.view.list({ table_id: tableId })
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

  public async isRowExistInQuery(
    tableId: string,
    rowId: string,
    query: string
  ) {
    return await this.view.isRowExistInQuery(tableId, rowId, query)
  }

  public async getRecomputeRows(tableId: string, rowIds: string[]) {
    return await this.view.recompute(tableId, rowIds)
  }

  // columns
  public async addColumn(data: IField) {
    return await this.column.add(data)
  }
  public async deleteField(tableName: string, tableColumnName: string) {
    await this.column.deleteField(tableName, tableColumnName)
  }

  public async listRawColumns(tableName: string) {
    return await this.db.selectObjects(`PRAGMA table_info(${tableName})`)
  }

  public async updateColumnProperty(data: {
    tableName: string
    tableColumnName: string
    property: any
    type: FieldType
  }) {
    return await this.column.updateProperty(data)
  }

  public async addRow(tableName: string, data: Record<string, any>) {
    const tableId = getTableIdByRawTableName(tableName)
    const tm = new TableManager(tableId, this)
    return await tm.rows.create(data)
  }

  // actions
  public async addAction(data: any) {
    await this.action.add(data)
  }

  public async listActions() {
    return this.action.list()
  }

  // scripts
  public async addScript(data: IScript) {
    await this.script.add(data)
  }

  public async listScripts(status: ScriptStatus = "all") {
    const query =
      status === "all" ? undefined : { enabled: status === "enabled" }
    return this.script.list(query)
  }

  public async getScript(id: string) {
    return this.script.get(id)
  }

  public async deleteScript(id: string) {
    await this.script.del(id)
  }

  public async updateScript(data: IScript) {
    await this.script.set(data.id, data)
  }
  public async enableScript(id: string) {
    await this.script.enable(id)
  }

  public async disableScript(id: string) {
    await this.script.disable(id)
  }

  // docs
  public async rebuildIndex(refillNullMarkdown: boolean = false) {
    await this.doc.rebuildIndex(refillNullMarkdown)
  }

  public async addDoc(
    docId: string,
    content: string,
    markdown: string,
    isDayPage = false
  ) {
    await this.doc.add({ id: docId, content, markdown, is_day_page: isDayPage })
  }

  // update doc mount on sqlite for now,maybe change to fs later
  public async updateDoc(
    docId: string,
    content: string,
    markdown: string,
    _isDayPage = false
  ) {
    const res = await this.doc.get(docId)
    // yyyy-mm-dd is day page
    const isDayPage = _isDayPage || /^\d{4}-\d{2}-\d{2}$/g.test(docId)
    if (!res) {
      await this.doc.add({
        id: docId,
        content,
        markdown,
        is_day_page: isDayPage,
      })
    } else {
      await this.doc.set(docId, {
        id: docId,
        content,
        markdown,
        is_day_page: isDayPage,
      })
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
   * @param parent_id
   * @returns
   */
  public async createOrUpdateDocWithMarkdown(
    docId: string,
    mdStr: string,
    parent_id?: string
  ) {
    if (isDayPageId(docId)) {
      return this.doc.createOrUpdateWithMarkdown(docId, mdStr)
    } else {
      return this.withTransaction(async () => {
        await this.getOrCreateTreeNode({
          id: docId,
          name: docId,
          parent_id: parent_id,
          type: "doc",
        })
        return await this.doc.createOrUpdateWithMarkdown(docId, mdStr)
      })
    }
  }

  public async deleteDoc(docId: string) {
    await this.doc.del(docId)
  }

  public async fullTextSearch(query: string) {
    return this.doc.search(query)
  }

  public async createTable(id: string, name: string, tableSchema: string) {
    this.withTransaction(async () => {
      this.addTreeNode({ id, name, type: "table" })
      await this.sql`${tableSchema}`
      // create view for table
      await this.createDefaultView(id)
    })
  }

  // table

  public async fixTable(tableId: string) {
    const tableManager = this.table(tableId)
    return await tableManager.fixTable(tableId)
  }
  public async hasSystemColumn(tableId: string, column: string) {
    const tableManager = this.table(tableId)
    return await tableManager.hasSystemColumn(tableId, column)
  }

  // table
  public async isTableExist(id: string) {
    const tableManager = this.table(id)
    return await tableManager.isExist(id)
  }

  public async deleteTable(id: string) {
    await this.table(id).del(id)
  }

  public async listDays(page: number) {
    return await this.doc.listDayPage(page)
  }

  public async listAllDays() {
    return await this.doc.listAllDayPages()
  }

  public syncExec2(sql: string, bind: any[] = [], db = this.db) {
    const res: any[] = []
    console.debug(
      "[%cSQLQuery:%cCallViaMethod]",
      "color:indigo",
      "color:green",
      sql,
      bind
    )
    db.exec({
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
  // FIXME: there are some problem with headless lexical run in worker
  // return markdown string, compute in worker
  // public async asyncGetDocMarkdown(docId: string) {
  //   return await getDocMarkdown(this.dbName, docId)
  // }
  // return object array
  public async exec2(sql: string, bind: any[] = []) {
    return this.syncExec2(sql, bind)
  }

  public async runAIgeneratedSQL(sql: string, tableName: string) {
    const fields = await this.column.list({ table_name: tableName })
    const _sql = transformQuery(sql, fields)
    const res = await this.exec2(_sql)
    return RowsManager.getReadableRows(res, fields)
  }

  // tree
  public async listTreeNodes(query?: string, withSubNode?: boolean) {
    return this.tree.list({ query, withSubNode })
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
      if (node?.parent_id) {
        const parent = await this.tree.get(node.parent_id)
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

  public async getOrCreateTreeNode(data: ITreeNode) {
    const node = await this.tree.get(data.id)
    if (node) {
      return node
    }
    return this.tree.add(data)
  }

  public async getTreeNode(id: string) {
    return this.tree.get(id)
  }

  public async moveDraftIntoTable(id: string, tableId: string) {
    return this.tree.moveIntoTable(id, tableId)
  }

  public async listUiColumns(tableName: string) {
    return this.column.list({ table_name: tableName })
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
    console.debug(sql, bind)
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
    // console.debug(sql, bind)
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
    // console.debug(sql, bind)
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
    logger.debug(
      "[%cSQLQuery:%cCallViaRawSql]",
      "color:indigo",
      "color:red",
      sql,
      bind,
      rowMode
    )
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
    console.debug("onUpdate")
  }

  public async withTransaction(fn: Function) {
    // TODO: use this.db.transaction replace
    try {
      this.db.exec("BEGIN TRANSACTION;")
      const res = await fn()
      this.db.exec("COMMIT;")
      return res
    } catch (error) {
      this.db.exec("ROLLBACK;")
      throw error
    }
  }

  public notify(msg: { title: string; description: string }) {
    postMessage({
      type: MsgType.Notify,
      data: msg,
    })
  }
}
