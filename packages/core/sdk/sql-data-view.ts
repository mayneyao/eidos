import { ViewTypeEnum } from "../types/IView"
import type { DataSpace } from "../DataSpace"
import { shortenId, uuidv7 } from "@/lib/utils"
import type { IField } from "../types/IField"
import { FieldType } from "../fields/const"
import { allFieldTypesMap } from "../fields"

export class SqlDataView {
    constructor(private dataSpace: DataSpace) {
    }


    async delete(id: string) {
        const viewName = `vw_${id}`
        await this.dataSpace.db.prepare('BEGIN TRANSACTION;').run()
        try {
            await this.dataSpace.db.prepare(`DROP VIEW IF EXISTS ${viewName};`).run()
            await this.dataSpace.view.deleteByTableId(id)
            await this.dataSpace.column.deleteByRawTableName(viewName)
            await this.dataSpace.tree.del(id)
        } catch (error) {
            await this.dataSpace.db.prepare('ROLLBACK;').run()
            console.error('Error in delete view transaction:', error)
            throw error
        } finally {
            await this.dataSpace.db.prepare('COMMIT;').run()
        }
    }

    async isDataViewExist(id: string) {
        const viewName = `vw_${id}`
        const view = await this.dataSpace.db.exec({
            sql: `SELECT name, sql FROM sqlite_master WHERE type='view' and name = ?;`,
            bind: [viewName]
        })
        return view.length > 0
    }

    async getViewRawQuery(tableName: string) {
        const view = await this.dataSpace.db.exec({
            sql: `SELECT sql FROM sqlite_master WHERE type='view' and name = ?;`,
            bind: [tableName]
        })
        return view[0]?.sql || ""
    }

    async getViewColumns(id: string) {
        const viewName = `vw_${id}`
        const columns = await this.dataSpace.db.prepare(`PRAGMA table_info(${viewName});`).all()
        return columns
    }

    async getViewFields(id: string): Promise<IField[]> {
        const viewName = `vw_${id}`
        const columns = await this.getViewColumns(id)
        const modifiedColumns = await this.dataSpace.column.list({ table_name: viewName })
        return columns.map((column) => {
            const modifiedColumn = modifiedColumns.find((c) => c.table_column_name === column.name)
            if (modifiedColumn) {
                return modifiedColumn
            }
            return {
                name: column.name,
                type: FieldType.Text,
                table_column_name: column.name,
                table_name: viewName,
                property: {},
            }
        })
    }

    async updateViewColumn({
        tableName,
        tableColumnName,
        type,
        property,
    }: {
        tableName: string
        tableColumnName: string
        type: FieldType
        property: any
    }) {

        const defaultFieldProperty =
            allFieldTypesMap[type].getDefaultFieldProperty()

        const isEmptyProperty = Object.keys(property).length === 0
        const updateData = {
            name: tableColumnName,
            type,
            table_name: tableName,
            table_column_name: tableColumnName,
            property: isEmptyProperty ? defaultFieldProperty : property,
        }
        const column = await this.dataSpace.column.getColumn(tableName, tableColumnName)
        if (!column) {
            await this.dataSpace.column.addPureUIColumn(updateData)
        } else {
            await this.dataSpace.column.updatePureUIColumn(updateData)
        }
    }

    async createDataView(id: string, createViewSql: string, isTemp: boolean = false) {
        const viewName = `vw_${id}`
        if (!isTemp) {
            // delete temp view
            await this.delete(id)
        }
        await this.dataSpace.db.prepare('BEGIN TRANSACTION;').run()

        try {
            await this.dataSpace.db.prepare(`CREATE ${isTemp ? 'TEMPORARY' : ''} VIEW IF NOT EXISTS ${viewName} AS ${createViewSql};`).run();
            await this.dataSpace.view.add({
                id: shortenId(uuidv7()),
                name: `New View`,
                type: ViewTypeEnum.Grid,
                table_id: id,
                query: `select * from ${viewName}`,
            })
        } catch (error) {
            await this.dataSpace.db.prepare('ROLLBACK;').run()
            console.error('Error in createDataView transaction:', error)
            throw error
        } finally {
            await this.dataSpace.db.prepare('COMMIT;').run()
        }
        return true
    }
}