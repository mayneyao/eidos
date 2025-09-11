import { FieldType } from "../fields/const"
import {
    extractIdFromShortId,
    getRawTableNameById,
    getTableIdByRawTableName,
} from "@/lib/utils"
import { TableManager } from "../sdk/table"
import { RowsManager } from "../sdk/rows"
import { TreeNodeType } from "../types/ITreeNode"
import { DataSpaceWithDoc } from "./doc"
import type { IField } from "../types/IField"

// Extension class to add table-related methods
export class DataSpaceWithTable extends DataSpaceWithDoc {
    // table factory method
    public table(id: string) {
        return new TableManager(id, this)
    }

    // table full text search
    public async rebuildFTS(tableId: string) {
        this.blockUIMsg("Rebuilding FTS table, please wait.")
        const tableName = getRawTableNameById(tableId)
        await this.tableFullTextSearch.rebuildFTS(tableName)
        this.blockUIMsg(null)
    }


    public semanticSearch = async (params: {
        tableName: string,
        query: string,
        viewId?: string,
        fieldId?: string,
        page: number,
        pageSize: number
    }) => {
        return this.tableSemanticSearch.search(params)
    }

    public async getLookupContext(tableName: string, columnName: string) {
        const tableId = getTableIdByRawTableName(tableName)
        const tableManager = this.table(tableId)
        return tableManager.fields.lookup.getLookupContext(tableName, columnName)
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

    // embedding methods
    public updateEmbedding = async (tableId: string, fieldId: string, data: { recordId: string, value: string }[]) => {
        const tm = new TableManager(tableId, this)
        await tm.fields.text.updateEmbedding(fieldId, data)
    }

    public queryEmbedding = async (tableId: string, fieldId: string, query: string, limit = 10) => {
        const tm = new TableManager(tableId, this)
        return await tm.fields.text.queryEmbedding(fieldId, query, limit)
    }

    public getEmbeddingStats = async (tableId: string, fieldId: string) => {
        const tm = new TableManager(tableId, this)
        return await tm.fields.text.getEmbeddingStats(fieldId)
    }

    public resetEmbedding = async (tableId: string, fieldId: string) => {
        const tm = new TableManager(tableId, this)
        return await tm.fields.text.resetEmbedding(fieldId)
    }

    public updateLookupColumn(tableName: string, columnName: string) {
        const tableId = getTableIdByRawTableName(tableName)
        const tableManager = this.table(tableId)
        return tableManager.fields.lookup.updateColumn({
            tableName,
            tableColumnName: columnName,
        })
    }

    // index methods
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

    // row operations
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
                await this.syncExec2(sql, bind, db)
            }
        })
        this.undoRedoManager.event()
    }

    public async createRecords(table_id: string, records: Record<string, any>[]) {
        const tm = new TableManager(table_id, this)
        const res = await tm.rows.batchCreate(records, {
            returnReadableData: true
        })
        return res
    }

    public async addRow(
        tableName: string,
        data: Record<string, any>,
        options?: {
            useFieldId?: boolean
        }
    ): Promise<Record<string, any>> {
        const tableId = getTableIdByRawTableName(tableName)
        const tm = new TableManager(tableId, this)
        const res = await tm.rows.create(data, options)
        // this.undoRedoManager.event()
        const row = await tm.rows.get(res._id, { raw: true, withRowId: true })
        return row
    }

    // table lifecycle methods
    public async createTable(fields: Array<{
        name: string
        type: FieldType
    }>, name: string) {
        const { createTableSql, tableId } = TableManager.generateCreateTableSql(fields)
        console.log("create table sql: ", createTableSql)
        await this.createTableViaSchema(tableId, name, createTableSql)
        return tableId
    }

    public async createTableViaSchema(
        id: string,
        name: string,
        tableSchema: string,
        parent_id?: string
    ) {
        // FIXME: should use db transaction to execute multiple sql
        this.db.transaction(async (db) => {
            await this.tree.addNode({ id, name, type: TreeNodeType.Table, parent_id })
            db.exec(tableSchema)
            // create view for table
            await this.view.createDefaultView(getRawTableNameById(id))
        })
    }

    public async fixTable(tableId: string) {
        const tableManager = this.table(tableId)
        return await tableManager.fixTable(tableId)
    }

    public async hasSystemColumn(tableId: string, column: string) {
        const tableManager = this.table(tableId)
        return await tableManager.hasSystemColumn(tableId, column)
    }

    public async isTableExist(id: string) {
        const tableManager = this.table(id)
        return await tableManager.isExist(id)
    }

    public async deleteTable(id: string) {
        await this.table(id).del(id)
    }

    // FTS methods for tables
    public async createTableFTS(tableName: string, temporary: boolean = false) {
        return await this.tableFullTextSearch.createDynamicFTS(tableName, temporary)
    }

    public async searchTableFTS(tableName: string, query: string, viewId: string, page: number = 1, pageSize: number = 20) {
        return await this.tableFullTextSearch.search(tableName, query, viewId, page, pageSize)
    }

    public async hasTableFTS(tableName: string) {
        return await this.tableFullTextSearch.hasFTS(tableName)
    }

    // AI generated SQL execution
    public async runAIgeneratedSQL(sql: string, tableName: string) {
        const { getTableNameFromSql, transformQuery } = await import("../sqlite/sql-formula-parser")
        const _tableName = getTableNameFromSql(sql) || tableName
        const fields = await this.column.list({ table_name: _tableName })
        const _sql = transformQuery(sql, fields)
        const res = await this.exec2(_sql)
        return RowsManager.getReadableRows(res, fields)
    }
}
