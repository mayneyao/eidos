import { Database, Sqlite3Static } from "@sqlite.org/sqlite-wasm"

import { EidosDataEventChannelName, MsgType } from "@/lib/const"
import { FieldType } from "@/lib/fields/const"
import { logger } from "@/lib/env"
import { ColumnTableName } from "@/lib/sqlite/const"
import { buildSql, isReadOnlySql } from "@/lib/sqlite/helper"
import {
  getTableNameFromSql,
  transformQuery,
} from "@/lib/sqlite/sql-formula-parser"
import {
  EidosFileSystemManager,
  FileSystemType,
} from "@/lib/storage/eidos-file-system"
import { ITreeNode } from "@/lib/store/ITreeNode"
import { IView } from "@/lib/store/IView"
import { IField } from "@/lib/store/interface"
import {
  extractIdFromShortId,
  getRawTableNameById,
  getTableIdByRawTableName,
  isDayPageId,
} from "@/lib/utils"

import { DataChangeEventHandler } from "./data-pipeline/DataChangeEventHandler"
import { DataChangeTrigger } from "./data-pipeline/DataChangeTrigger"
import { LinkRelationUpdater } from "./data-pipeline/LinkRelationUpdater"
import { SQLiteUndoRedo } from "./data-pipeline/UndoRedo"
import { DbMigrator } from "./db-migrator/DbMigrator"
import { timeit } from "./helper"
import { CsvImportAndExport } from "./import-and-export/csv"
import { MarkdownImportAndExport } from "./import-and-export/markdown"
import { ActionTable } from "./meta-table/action"
import { BaseTable } from "./meta-table/base"
import { ColumnTable } from "./meta-table/column"
import { DocTable } from "./meta-table/doc"
import { EmbeddingTable, IEmbedding } from "./meta-table/embedding"
import { FileTable, IFile } from "./meta-table/file"
import { ReferenceTable } from "./meta-table/reference"
import { IScript, ScriptStatus, ScriptTable } from "./meta-table/script"
import { TreeTable } from "./meta-table/tree"
import { ViewTable } from "./meta-table/view"
import { RowsManager } from "./sdk/rows"
import { TableManager } from "./sdk/table"
import { withSqlite3AllUDF } from "./udf"
import { BaseServerDatabase } from "@/lib/sqlite/interface"

export type EidosTable =
  | DocTable
  | ActionTable
  | ScriptTable
  | TreeTable
  | ViewTable
  | ColumnTable
  | EmbeddingTable
  | FileTable


export type EidosDatabase = Database | BaseServerDatabase

export class DataSpace {
  db: EidosDatabase
  draftDb: DataSpace | undefined
  sqlite3: Sqlite3Static | undefined
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
  hasLoadExtension = false
  // worker to main thread
  postMessage?: (data: any, transfer?: any[]) => void
  callRenderer?: (type: any, data: any) => Promise<any>
  // channel broadcast
  dataEventChannel: {
    postMessage: (data: any) => void
  }

  // for trigger
  eventHandler: DataChangeEventHandler
  efsManager?: EidosFileSystemManager

  // for auto migration
  hasMigrated = false
  constructor(config: {
    db: EidosDatabase
    activeUndoManager: boolean
    dbName: string
    context: {
      setInterval?: typeof setInterval
    }
    hasLoadExtension?: boolean
    createUDF?: (db: EidosDatabase) => void,
    sqlite3?: Sqlite3Static
    draftDb?: DataSpace
    postMessage?: (data: any, transfer?: any[]) => void
    callRenderer?: (type: any, data: any) => Promise<any>
    efsManager?: EidosFileSystemManager
    dataEventChannel?: {
      postMessage: (data: any) => void
    }
  }) {
    const { db, activeUndoManager, dbName, sqlite3, draftDb, context, createUDF, postMessage, efsManager, dataEventChannel, hasLoadExtension, callRenderer } = config
    this.db = db

    this.hasLoadExtension = Boolean(hasLoadExtension)
    if (dataEventChannel) {
      this.dataEventChannel = dataEventChannel
    } else {
      this.dataEventChannel = new BroadcastChannel(EidosDataEventChannelName)
    }

    if (callRenderer) {
      this.callRenderer = callRenderer
    } else {
      this.callRenderer = (type: any, data: any) => {
        const channel = new MessageChannel()
        self.postMessage({ type, data }, [channel.port2])
        return new Promise((resolve) => {
          channel.port1.onmessage = (event) => {
            resolve(event.data)
          }
        })
      }
    }
    this.sqlite3 = sqlite3
    this.draftDb = draftDb
    this.dbName = dbName
    this.postMessage = postMessage
    this.efsManager = efsManager

    this.initUDF()
    this.eventHandler = new DataChangeEventHandler(this)
    this.dataChangeTrigger = new DataChangeTrigger()
    this.linkRelationUpdater = new LinkRelationUpdater(
      this,
      context.setInterval
    )
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
      // // after migration, enable opfs SyncAccessHandle Pool for better performance
      // this.sqlite3.installOpfsSAHPoolVfs({}).then((poolUtil) => {
      //   console.debug("poolUtil", poolUtil)
      // })
    }
    this.initMetaTable()
    if (createUDF) {
      createUDF(this.db)
    }

    // other
    this.undoRedoManager = new SQLiteUndoRedo(this)
    this.activeUndoManager = activeUndoManager
  }

  // close db
  public closeDb() {
    this.db.close()
  }

  private initUDF() {
    const allUfs = withSqlite3AllUDF(this.dataEventChannel)
    // system functions
    if (this.db instanceof BaseServerDatabase) {
      allUfs.ALL_UDF_NO_CTX.forEach((udf) => {
        this.db.createFunction(udf as any)
      })
    } else {
      allUfs.ALL_UDF.forEach((udf) => {
        this.db.createFunction(udf as any)
      })
    }
  }

  private initMetaTable() {
    this.allTables.forEach((table) => {
      this.db.exec(table.createTableSql);
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
      if (this.activeUndoManager) {
        this.activeTablesUndoRedo([tableName])
      }
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

  // index
  public createTableIndex(tableId: string, column: string) {
    this.table(tableId).index.createIndex(
      column,
      () => {
        this.blockUIMsg(
          "You are operating on a large table; auto indexing, please wait."
        )
      },
      () => {
        this.blockUIMsg(null)
      }
    )
    return
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
    if (update.from == update.to) {
      return
    }
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
      await this.table(data.tableId).rows.update(
        data.rowId,
        {
          [data.fieldId]: data.value,
        },
        { useFieldId: true }
      )
      return
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

  /**
   * Starting from v0.5.0, we switched to using uuidv7 as the _id, and the logic of deleteRowsByRange changed from sorting by rowid to sorting by _id.
   * This function is suitable for old versions of tables where _id of row is uuidv4, and data cannot be deleted by selection, but by a list of _id values.
   * There are some limitations, such as the maximum number of records that can be deleted at once is limited by the sqlite bind parameter.
   * @param rowIds
   * @param tableId
   */
  public async deleteRowsByIds(ids: string[], tableName: string) {
    const tableId = getTableIdByRawTableName(tableName)
    const tableManager = this.table(tableId)
    await tableManager.rows.batchDelete(ids)
    this.undoRedoManager.event()
  }

  public async deleteRowsByRange(
    range: { startIndex: number; endIndex: number }[],
    tableName: string,
    query: string
  ) {
    // query is a sql string like "select * from tb_xxxxx Order by _id"
    // range is a array of {startIndex: number, endIndex: number}
    // we need to delete rows from startIndex to endIndex
    if ("order by" !== query.toLowerCase().match(/order by/g)?.[0]) {
      // when query has no order by, we need to add order by to make sure delete from start to end
      query += " ORDER BY _id"
    }
    const sql = `DELETE FROM ${tableName} WHERE _id in (SELECT _id FROM (${query}) LIMIT ? OFFSET ?)`
    await this.db.transaction(async (db) => {
      // reverse range, delete from end to start to avoid index change
      for (const item of range.reverse()) {
        const bind = [item.endIndex - item.startIndex, item.startIndex]
        this.syncExec2(sql, bind, db)
      }
    })
    this.undoRedoManager.event()
  }

  // files
  public async addFile(file: IFile) {
    return await this.file.add(file)
  }

  public async uploadDir(
    dirHandle: FileSystemDirectoryHandle,
    _parentPath?: string[]
  ) {
    const fs = new EidosFileSystemManager(dirHandle)
    console.log(fs)
    const files = await fs.walk([])
    console.log(files)
    const count = files.length
    console.log(count)
    await this.file.uploadDir(dirHandle, count, 0, _parentPath)
    this.blockUIMsg(null)
    return
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

  public async saveFile2EFS(url: string, subDir: string[] = [], name?: string) {
    return await this.file.saveFile2EFS(url, subDir, name)
  }

  public async listFiles() {
    return await this.file.list()
  }

  public async walkFiles() {
    return await this.file.walk()
  }

  public async transformFileSystem(
    sourceFs: FileSystemType,
    targetFs: FileSystemType
  ) {
    return await this.file.transformFileSystem(sourceFs, targetFs)
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
    this.blockUIMsg("Deleting column, please wait.")
    const res = await this.column.deleteField(tableName, tableColumnName)
    this.blockUIMsg(null)
    return res
  }

  public async changeColumnType(
    tableName: string,
    columnName: string,
    type: FieldType
  ) {
    return await this.column.changeType(tableName, columnName, type)
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

  @timeit(100)
  public async addRow(
    tableName: string,
    data: Record<string, any>
  ): Promise<Record<string, any>> {
    const tableId = getTableIdByRawTableName(tableName)
    const tm = new TableManager(tableId, this)
    const res = await tm.rows.create(data)
    // this.undoRedoManager.event()
    const row = await tm.rows.get(res._id, { raw: true, withRowId: true })
    return row
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
    await this.doc.rebuildIndex({ refillNullMarkdown })
  }

  @timeit(100)
  public async addDoc(
    docId: string,
    content: string,
    markdown: string,
    isDayPage = false
  ) {
    await this.doc.add({ id: docId, content, markdown, is_day_page: isDayPage })
  }

  public async getDocBaseInfo(id: string) {
    return this.doc.getBaseInfo(id)
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
    parent_id?: string,
    title?: string
  ) {
    return this.createOrUpdateDoc({
      docId,
      content: mdStr,
      type: "markdown",
      parent_id,
      title,
    })
  }

  public async createOrUpdateDoc(data: {
    docId: string
    content: string
    type: "html" | "markdown" | "email"
    parent_id?: string
    title?: string
    mode?: "replace" | "append"
  }) {
    if (isDayPageId(data.docId)) {
      return this.doc.createOrUpdate({
        id: data.docId,
        text: data.content,
        type: data.type,
        mode: data.mode,
      })
    } else {
      return this.db.transaction(async () => {
        await this.getOrCreateTreeNode({
          id: data.docId,
          name: data.title || data.docId,
          parent_id: data.parent_id,
          type: "doc",
        })
        return await this.doc.createOrUpdate({
          id: data.docId,
          text: data.content,
          type: data.type,
          mode: data.mode,
        })
      })
    }
  }

  public async deleteDoc(docId: string) {
    await this.doc.del(docId)
  }

  public async listAllDocIds() {
    const res = await this.doc.list({
    }, {
      fields: ["id"]
    })
    return res.map((doc) => doc.id)
  }

  public async fullTextSearch(query: string) {
    return this.doc.search(query)
  }

  @timeit(100)
  public async createTable(
    id: string,
    name: string,
    tableSchema: string,
    parent_id?: string
  ) {
    // FIXME: should use db transaction to execute multiple sql
    this.db.transaction(async (db) => {
      await this.addTreeNode({ id, name, type: "table", parent_id })
      db.exec(tableSchema)
      // create view for table
      await this.createDefaultView(id)
    })
  }

  public async importCsv(file: {
    name: string
    content: string
  }) {
    const csvImport = new CsvImportAndExport()
    console.log("importing csv file", file)
    const tableId = await csvImport.import(file, this)
    return tableId
  }

  public async exportCsv(tableId: string) {
    const csvImport = new CsvImportAndExport()
    return await csvImport.export(tableId, this)
  }

  public async importMarkdown(file: {
    name: string
    content: string
  }) {
    const markdownImport = new MarkdownImportAndExport()
    const nodeId = await markdownImport.import(file, this)
    return nodeId
  }

  public async exportMarkdown(nodeId: string) {
    const markdownImport = new MarkdownImportAndExport()
    return await markdownImport.export(nodeId, this)
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

  public async restoreNode(id: string) {
    await this.tree.set(id, {
      is_deleted: false,
    })
  }

  public async deleteNode(id: string) {
    await this.tree.set(id, {
      is_deleted: true,
    })
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

  @timeit(100)
  public syncExec2(sql: string, bind: any[] = [], db = this.db): any {
    const res: any[] = []
    // console.debug(
    //   "[%cSQLQuery:%cCallViaMethod]",
    //   "color:indigo",
    //   "color:green",
    //   sql,
    //   bind
    // )
    if (db instanceof BaseServerDatabase) {
      try {
        return db.exec({
          sql,
          bind,
          returnValue: "resultRows",
          rowMode: "object",
        })
      } catch (error: any) {
        if (error.toString().includes("SqliteError")) {
          this.notify({
            title: "SqliteError",
            description: error.toString(),
          })
        }
        console.log(error)
      }
    }
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
  //   const doc = await this.doc.get(docId)
  //   if (!doc) {
  //     throw new Error(`doc ${docId} not found`)
  //   }
  //   return await _getDocMarkdown(doc.markdown)
  // }
  // return object array
  public async exec2(sql: string, bind: any[] = []) {
    return this.syncExec2(sql, bind)
  }

  public async runAIgeneratedSQL(sql: string, tableName: string) {
    const _tableName = getTableNameFromSql(sql) || tableName
    const fields = await this.column.list({ table_name: _tableName })
    const _sql = transformQuery(sql, fields)
    const res = await this.exec2(_sql)
    return RowsManager.getReadableRows(res, fields)
  }

  // tree
  public async listTreeNodes(query?: string, withSubNode?: boolean) {
    return this.tree.query({ query, withSubNode })
  }

  public async updateTreeNodePosition(id: string, position: number) {
    return this.tree.set(id, {
      position,
    })
  }

  public async pinNode(id: string, isPinned: boolean) {
    return this.tree.pin(id, isPinned)
  }

  public async toggleNodeFullWidth(id: string, isFullWidth: boolean) {
    return this.tree.set(id, {
      is_full_width: isFullWidth,
    })
  }

  public async toggleNodeLock(id: string, isLocked: boolean) {
    return this.tree.set(id, {
      is_locked: isLocked,
    })
  }

  public async updateTreeNodeName(id: string, name: string) {
    const node = await this.tree.get(id)
    if (node?.name === name) {
      return
    }
    return this.db.transaction(async () => {
      // FIXME: should use db transaction to execute multiple sql
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
    const _data = { ...data }
    const parent = data.parent_id && (await this.tree.getNode(data.parent_id))
    if (parent && parent.type === "table") {
      const tableRawName = getRawTableNameById(parent.id)
      // fix parent_id
      _data.parent_id = parent.id
      await this.exec2(
        `INSERT OR IGNORE INTO ${tableRawName} (_id,title) VALUES (?,?);`,
        [extractIdFromShortId(data.id), data.name]
      )
    }
    if (node) {
      return node
    }
    return this.tree.add(_data)
  }

  public async getTreeNode(id: string) {
    return this.tree.get(id)
  }

  public async moveDraftIntoTable(
    id: string,
    tableId: string,
    parentId?: string
  ) {
    return this.tree.moveIntoTable(id, tableId, parentId)
  }

  public async nodeChangeParent(
    id: string,
    parentId?: string,
    opts?: {
      targetId: string
      targetDirection: "up" | "down"
    }
  ) {
    if (parentId) {
      await this.tree.checkLoop(id, parentId)
    }
    let data: Partial<ITreeNode> = {
      parent_id: parentId,
    }
    if (opts) {
      const newPosition = await this.tree.getPosition({
        parentId,
        targetId: opts.targetId,
        targetDirection: opts.targetDirection,
      })
      data = {
        ...data,
        position: newPosition,
      }
    }
    await this.tree.set(id, data)
    return data
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

  private async activeTablesUndoRedo(tables: string[]) {
    if (!tables) {
      return
    }
    this.undoRedoManager.deactivate()
    this.undoRedoManager.activate(tables)
  }

  @timeit(100)
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
  @timeit(100)
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

  @timeit(100)
  private execSqlWithBind(
    sql: string,
    bind: any[] = [],
    rowMode: "object" | "array" = "array"
  ) {
    // console.debug(sql, bind)
    const res: any[] = []
    if (this.db instanceof BaseServerDatabase) {
      return this.db.exec({
        sql,
        bind,
        returnValue: "resultRows",
        rowMode,
      })
    }
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
      logger.error({ sql, bind })
      this.postMessage?.({
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
  @timeit(100)
  public async sql4mainThread(
    sql: string,
    bind: any[] = [],
    rowMode: "object" | "array" = "array"
  ) {
    // logger.debug(
    //   "[%cSQLQuery:%cCallViaRawSql]",
    //   "color:indigo",
    //   "color:red",
    //   sql,
    //   bind,
    //   rowMode
    // )
    const res = await this.execSqlWithBind(sql, bind, rowMode)
    // when sql will update database, call event
    if (!isReadOnlySql(sql)) {
      // delay trigger event
      setTimeout(() => this.undoRedoManager.event(), 30)
    }
    return res
  }

  // return object array
  public async sql4mainThread2(sql: string, bind: any[] = []) {
    // logger.debug(
    //   "[%cSQLQuery:%cCallViaRawSql]",
    //   "color:indigo",
    //   "color:red",
    //   sql,
    //   bind,
    //   "object"
    // )
    return this.execSqlWithBind(sql, bind, "object")
  }

  public onUpdate() {
    this.postMessage?.({
      type: MsgType.DataUpdateSignal,
      data: {
        database: this.dbName,
      },
    })
    console.debug("onUpdate")
  }

  public notify(msg: { title: string; description: string }) {
    this.postMessage?.({
      type: MsgType.Notify,
      data: msg,
    })
  }

  public blockUIMsg(msg: string | null, data?: Record<string, any>) {
    console.log("blockUIMsg", msg, data)
    this.postMessage?.({
      type: MsgType.BlockUIMsg,
      data: {
        msg,
        data,
      },
    })
  }
}
