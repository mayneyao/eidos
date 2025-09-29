import { MsgType } from "@/lib/const";
import type { EidosFileSystemManager } from "@/lib/storage/eidos-file-system";
import {
  getTableIdByRawTableName
} from "@/lib/utils";
import { ColumnTableName } from "../sqlite/const";
import type { IField } from "../types/IField";

import { DataChangeEventHandler } from "../data-pipeline/DataChangeEventHandler";
import { DataChangeTrigger } from "../data-pipeline/DataChangeTrigger";
import { LinkRelationUpdater } from "../data-pipeline/LinkRelationUpdater";
import { TableFullTextSearch } from "../data-pipeline/TableFullTextSearch";
import { TableSemanticSearch } from "../data-pipeline/TableSemanticSearch";
import { SQLiteUndoRedo } from "../data-pipeline/UndoRedo";
import { DbMigrator } from "../db-migrator/DbMigrator";
import { CsvImportAndExport } from "../import-and-export/csv";
import { MarkdownImportAndExport } from "../import-and-export/markdown";
import type { BaseTable } from "../meta-table/base";
import { ChatTable } from "../meta-table/chat";
import { ColumnTable } from "../meta-table/column";
import { DocTable } from "../meta-table/doc";
import type { IEmbedding } from "../meta-table/embedding";
import { EmbeddingTable } from "../meta-table/embedding";
import { ExtensionTable } from "../meta-table/extension";
import { ExtNodeTable } from "../meta-table/extnode";
import { FileTable } from "../meta-table/file";
import { KVTable } from "../meta-table/kv";
import { MessageTable } from "../meta-table/message";
import { ReferenceTable } from "../meta-table/reference";
import { TreeTable } from "../meta-table/tree";
import { ViewTable } from "../meta-table/view";
import { SqlDataView } from "../sdk/sql-data-view";
import { ThemeManager } from "../sdk/theme-manager";
import type { BaseServerDatabase } from "../sqlite/interface";
import { withSqlite3AllUDF } from "../udf";
// import { QueueTable } from "./meta-table/queue"

export type EidosTable =
  | DocTable
  | ExtensionTable
  | TreeTable
  | ViewTable
  | ColumnTable
  | EmbeddingTable
  | FileTable


export type EidosDatabase = BaseServerDatabase

export abstract class BaseDataSpace {
  db: EidosDatabase
  draftDb: BaseDataSpace | undefined
  undoRedoManager: SQLiteUndoRedo
  activeUndoManager: boolean
  dbName: string
  //  meta table
  doc: DocTable
  // script is deprecated, use extension instead
  script: ExtensionTable
  extension: ExtensionTable
  tree: TreeTable
  view: ViewTable
  column: ColumnTable
  reference: ReferenceTable
  embedding: EmbeddingTable
  // queue: QueueTable
  chat: ChatTable
  message: MessageTable
  file: FileTable
  extNode: ExtNodeTable
  kv: KVTable
  theme: ThemeManager
  dataView: SqlDataView
  dataChangeTrigger: DataChangeTrigger
  linkRelationUpdater: LinkRelationUpdater
  allTables: BaseTable<any>[] = []
  hasLoadExtension = false
  // worker to main thread
  postMessage?: (data: any, transfer?: any[]) => void
  callRenderer?: (type: any, data: any) => Promise<any>
  // channel broadcast
  dataEventChannel: BroadcastChannel

  // for trigger
  eventHandler: DataChangeEventHandler
  efsManager?: EidosFileSystemManager

  // for auto migration
  hasMigrated = false
  tableFullTextSearch: TableFullTextSearch
  tableSemanticSearch: TableSemanticSearch
  isUDFWithCtx = false
  context: {
    setInterval?: typeof setInterval
    embedding?: (text: string) => Promise<Array<number>>
  }
  constructor(config: {
    db: EidosDatabase
    activeUndoManager: boolean
    dbName: string
    context: {
      setInterval?: typeof setInterval
      embedding?: (text: string) => Promise<Array<number>>
    }
    hasLoadExtension?: boolean
    createUDF?: (db: EidosDatabase) => void,
    draftDb?: BaseDataSpace
    postMessage?: (data: any, transfer?: any[]) => void
    callRenderer?: (type: any, data: any) => Promise<any>
    efsManager?: EidosFileSystemManager
    dataEventChannel: BroadcastChannel,
    cacheSize?: number
    isUDFWithCtx?: boolean
    enableFTS?: boolean
  }) {
    const { db, activeUndoManager, dbName, draftDb,
      context, createUDF, postMessage, efsManager,
      dataEventChannel, hasLoadExtension, callRenderer,
      cacheSize, isUDFWithCtx, enableFTS = false } = config
    this.db = db
    this.context = context

    this.isUDFWithCtx = Boolean(isUDFWithCtx)
    this.hasLoadExtension = Boolean(hasLoadExtension)
    if (cacheSize) {
      this.setCacheSize(cacheSize)
    }
    this.dataEventChannel = dataEventChannel

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
    this.draftDb = draftDb
    this.dbName = dbName
    this.postMessage = postMessage
    this.efsManager = efsManager

    this.initUDF()
    this.eventHandler = new DataChangeEventHandler(this as any)
    this.dataChangeTrigger = new DataChangeTrigger()
    this.linkRelationUpdater = new LinkRelationUpdater(
      this as any,
      context.setInterval
    )
    // meta table
    this.doc = new DocTable(this as any)
    this.script = new ExtensionTable(this as any)
    this.extension = new ExtensionTable(this as any)
    this.tree = new TreeTable(this as any)
    this.view = new ViewTable(this as any)
    this.file = new FileTable(this as any)
    this.column = new ColumnTable(this as any)
    this.embedding = new EmbeddingTable(this as any)
    this.reference = new ReferenceTable(this as any)
    this.chat = new ChatTable(this as any)
    this.message = new MessageTable(this as any)
    this.extNode = new ExtNodeTable(this as any)
    this.theme = new ThemeManager(this as any)
    this.dataView = new SqlDataView(this as any)
    this.kv = new KVTable(this as any)
    // this.queue = new QueueTable(this)
    //
    this.allTables = [
      this.doc,
      this.script,
      this.tree,
      this.view,
      this.column,
      this.embedding,
      this.file,
      this.reference,
      this.chat,
      this.message,
      this.extNode,
      this.kv,
      // this.queue
    ]
    this.initMetaTable()
    // 
    this.doc.registerTrigger()

    // migration
    if (this.draftDb) {
      const dbMigrator = new DbMigrator(this as any, this.draftDb as any)
      dbMigrator.migrate().then(() => {
        this.hasMigrated = true
      })
      // // after migration, enable opfs SyncAccessHandle Pool for better performance
      // this.sqlite3.installOpfsSAHPoolVfs({}).then((poolUtil) => {
      //   console.debug("poolUtil", poolUtil)
      // })
    }

    if (createUDF) {
      createUDF(this.db)
    }

    // other
    this.undoRedoManager = new SQLiteUndoRedo(this as any)
    this.activeUndoManager = activeUndoManager

    this.tableFullTextSearch = new TableFullTextSearch(this as any, enableFTS)
    this.tableSemanticSearch = new TableSemanticSearch(this as any)
  }

  public async getSpaceName() {
    return this.dbName
  }


  protected setCacheSize(size: number) {
    this.db.exec({
      sql: `PRAGMA cache_size = ${size}`,
      bind: [],
    })
  }

  protected initUDF() {
    const allUfs = withSqlite3AllUDF(this.dataEventChannel)
    // system functions
    if (!this.isUDFWithCtx) {
      allUfs.ALL_UDF_NO_CTX.forEach((udf) => {
        this.db.createFunction(udf as any)
      })
    } else {
      allUfs.ALL_UDF.forEach((udf) => {
        this.db.createFunction(udf as any)
      })
    }
  }

  protected initMetaTable() {
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
    if (tableName.startsWith("vw_") || tableName.startsWith("eidos__")) {
      return
    }
    if (space === this.dbName) {
      const collist = await this.listRawColumns(tableName)
      await this.dataChangeTrigger.setTrigger(
        this as any,
        tableName,
        collist,
        toDeleteColumns
      )
      if (this.activeUndoManager) {
        this.activeTablesUndoRedo([tableName])
      }
    }
  }

  // @deprecated
  public async addEmbedding(embedding: IEmbedding) {
    return await this.embedding.add(embedding)
  }


  // views

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

  public async addField(data: IField) {
    return await this.column.addField(data)
  }
  public async deleteField(tableName: string, tableColumnName: string) {
    this.blockUIMsg("Deleting column, please wait.")
    const res = await this.column.deleteField(tableName, tableColumnName)
    this.blockUIMsg(null)
    return res
  }

  public async listRawColumns(tableName: string) {
    return await this.db.selectObjects(`PRAGMA table_info(${tableName})`)
  }

  public async importCsv(file: {
    name: string
    content: string
  }) {
    const csvImport = new CsvImportAndExport({ useWal: this.db.isWalMode })
    console.log("importing csv file", file)
    const tableId = await csvImport.import(file, this as any)
    return tableId
  }

  public async exportCsv(tableId: string) {
    const csvImport = new CsvImportAndExport({ useWal: this.db.isWalMode })
    return await csvImport.export(tableId, this as any)
  }

  public async importMarkdown(file: {
    name: string
    content: string
  }) {
    const markdownImport = new MarkdownImportAndExport()
    const nodeId = await markdownImport.import(file, this as any)
    return nodeId
  }

  public async exportMarkdown(nodeId: string) {
    const markdownImport = new MarkdownImportAndExport()
    return await markdownImport.export(nodeId, this as any)
  }


  public async listUiColumns(tableName: string) {
    if (tableName.startsWith("vw_")) {
      return this.dataView.getViewFields(getTableIdByRawTableName(tableName))
    }
    return this.column.list({ table_name: tableName })
  }

  /**
   * this will return all ui columns in this space
   * @param tableName
   * @returns
   */
  public async listAllUiColumns() {
    return this.syncExec2(`SELECT * FROM ${ColumnTableName} ;`)
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

  protected async activeTablesUndoRedo(tables: string[]) {
    if (!tables) {
      return
    }
    this.undoRedoManager.deactivate()
    this.undoRedoManager.activate(tables)
  }

  // Abstract methods to be implemented by extensions
  public abstract syncExec2(sql: string, bind?: any[], db?: any): Promise<any>


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
