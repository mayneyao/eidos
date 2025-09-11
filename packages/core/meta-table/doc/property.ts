import { FieldType } from "../../fields/const";
import { ColumnTableName } from "../../sqlite/const";
import { generateMetaTableTriggers } from "../../sqlite/sql-meta-table-trigger";
import type { BaseDocTable, DocMeta } from "./base";
import { filterValidProperties, RESERVED_PROPERTIES } from "./helper";

// Mixin to add property-related methods
type Constructor<T = {}> = new (...args: any[]) => T & BaseDocTable;

export function WithProperty<T extends Constructor>(Base: T) {
    return class PropertyDocTableMixin extends Base {
        /**
         * Ensure custom property columns exist, create them if they don't
         * @param properties custom properties object
         */
        async ensureCustomPropertyColumns(properties: Record<string, any>): Promise<void> {
            const validProperties = filterValidProperties(properties)

            for (const propertyName of Object.keys(validProperties)) {
                const exists = await this.columnExists(propertyName)
                if (!exists) {
                    // await this.addColumn(propertyName)
                    await this.dataSpace.column.add({
                        name: propertyName,
                        type: FieldType.Text,
                        table_name: this.name,
                        table_column_name: propertyName,
                        property: {},
                    })
                    this.flushTrigger()
                }
            }
        }

        // getCustomProperties
        async getCustomProperties(id: string) {
            try {
                // Get table column information
                const columns = await this.getTableColumns()

                // Filter out reserved properties to get custom property columns
                const customPropertyColumns = columns.filter((col: string) => !RESERVED_PROPERTIES.includes(col))

                // If there are no custom property columns, return empty object
                if (customPropertyColumns.length === 0) {
                    return {}
                }

                // Build precise SELECT statement, only selecting custom property columns
                const selectColumns = customPropertyColumns.join(', ')
                const sql = `SELECT ${selectColumns} FROM ${this.name} WHERE id = ?`

                const res = await this.dataSpace.exec2(sql, [id])

                if (!res[0]) {
                    return {}
                }

                // Return custom properties
                return res[0]
            } catch (error) {
                console.error('Failed to get properties:', error)
                return {}
            }
        }

        /**
         * Get all properties of a document (including system properties)
         * @param id document ID
         * @returns complete properties object
         */
        async getAllProperties(id: string) {
            const res = await this.dataSpace.exec2(
                `SELECT * FROM ${this.name} WHERE id = ?`,
                [id]
            )
            return res[0] || {}
        }

        async setProperties(id: string, properties: Record<string, any>) {
            const validProperties = filterValidProperties(properties)

            // If there are no valid properties, return directly
            if (Object.keys(validProperties).length === 0) {
                return { success: false, message: 'No valid properties to set' }
            }

            try {
                // Ensure custom property columns exist
                await this.ensureCustomPropertyColumns(validProperties)

                // Build dynamic UPDATE statement
                const setClauses = Object.keys(validProperties).map(prop => `${prop} = ?`).join(', ')
                const values = Object.values(validProperties)
                values.push(id) // Add id as WHERE condition value

                const sql = `UPDATE ${this.name} SET ${setClauses} WHERE id = ?`

                await this.dataSpace.exec2(sql, values)

                return { success: true, updatedProperties: Object.keys(validProperties) }
            } catch (error) {
                console.error('Failed to set properties:', error)
                return { success: false, message: `Failed to set properties: ${error}` }
            }
        }


        async deleteTrigger() {
            const triggerName = `${this.name}_update_trigger`
            this.dataSpace.db.exec(`DROP TRIGGER IF EXISTS ${triggerName};`)
        }

        async registerTrigger() {
            const columns = await this.getTableColumns()
            const triggers = generateMetaTableTriggers({
                tableName: this.name,
                fields: columns.map(col => ({ name: col })),
                operations: 'update',
                temporary: true
            })
            this.dataSpace.db.exec(triggers)
        }

        async flushTrigger() {
            await this.deleteTrigger()
            await this.registerTrigger()
        }

        /**
         * Get document's meta configuration
         * @param id document ID
         * @returns meta configuration object
         */
        async getMeta(id: string): Promise<DocMeta> {
            try {
                const res = await this.dataSpace.exec2(
                    `SELECT meta FROM ${this.name} WHERE id = ?`,
                    [id]
                )

                if (!res[0] || !res[0].meta) {
                    return { displayProperties: [] }
                }

                return JSON.parse(res[0].meta) as DocMeta
            } catch (error) {
                console.error('Failed to parse meta JSON:', error)
                return { displayProperties: [] }
            }
        }

        /**
         * Set document's meta configuration
         * @param id document ID
         * @param meta meta configuration object
         * @returns operation result
         */
        async setMeta(id: string, meta: DocMeta): Promise<{ success: boolean; message?: string }> {
            try {
                const metaJson = JSON.stringify(meta)
                await this.dataSpace.exec2(
                    `UPDATE ${this.name} SET meta = ? WHERE id = ?`,
                    [metaJson, id]
                )
                return { success: true }
            } catch (error) {
                console.error('Failed to set meta:', error)
                return { success: false, message: `Failed to set meta: ${error}` }
            }
        }

        /**
         * Add property to display list
         * @param id document ID
         * @param propertyName property name to display
         * @returns operation result
         */
        async addDisplayProperty(id: string, propertyName: string): Promise<{ success: boolean; message?: string }> {
            try {
                const meta = await this.getMeta(id)
                const displayProperties = meta.displayProperties || []

                if (displayProperties.includes(propertyName)) {
                    return { success: false, message: 'Property already in display list' }
                }

                const columns = await this.getTableColumns()
                if (!columns.includes(propertyName)) {
                    return { success: false, message: 'Property does not exist ' }
                }

                displayProperties.push(propertyName)
                meta.displayProperties = displayProperties

                return await this.setMeta(id, meta)
            } catch (error) {
                console.error('Failed to add display property:', error)
                return { success: false, message: `Failed to add display property: ${error}` }
            }
        }

        /**
         * Remove property from display list
         * @param id document ID
         * @param propertyName property name to remove
         * @returns operation result
         */
        async removeDisplayProperty(id: string, propertyName: string): Promise<{ success: boolean; message?: string }> {
            try {
                const meta = await this.getMeta(id)
                const displayProperties = meta.displayProperties || []

                const index = displayProperties.indexOf(propertyName)
                if (index === -1) {
                    return { success: false, message: 'Property not in display list' }
                }

                displayProperties.splice(index, 1)
                meta.displayProperties = displayProperties

                return await this.setMeta(id, meta)
            } catch (error) {
                console.error('Failed to remove display property:', error)
                return { success: false, message: `Failed to remove display property: ${error}` }
            }
        }

        /**
         * Set list of properties to display
         * @param id document ID
         * @param propertyNames array of property names to display
         * @returns operation result
         */
        async setDisplayProperties(id: string, propertyNames: string[]): Promise<{ success: boolean; message?: string }> {
            try {
                // Validate that all properties exist
                const columns = await this.getTableColumns()
                const invalidProperties = propertyNames.filter(prop =>
                    !columns.includes(prop)
                )

                if (invalidProperties.length > 0) {
                    return {
                        success: false,
                        message: `Invalid properties: ${invalidProperties.join(', ')}`
                    }
                }

                const meta = await this.getMeta(id)
                meta.displayProperties = propertyNames

                return await this.setMeta(id, meta)
            } catch (error) {
                console.error('Failed to set display properties:', error)
                return { success: false, message: `Failed to set display properties: ${error}` }
            }
        }

        /**
         * Get properties to display and their values
         * @param id document ID
         * @returns properties object to display
         */
        async getDisplayProperties(id: string): Promise<Record<string, any>> {
            try {
                const meta = await this.getMeta(id)
                const displayProperties = meta.displayProperties || []

                if (displayProperties.length === 0) {
                    return {}
                }

                // Build precise SELECT statement, only selecting properties to display
                const selectColumns = displayProperties.join(', ')
                const sql = `SELECT ${selectColumns} FROM ${this.name} WHERE id = ?`

                const res = await this.dataSpace.exec2(sql, [id])

                if (!res[0]) {
                    return {}
                }

                return res[0]
            } catch (error) {
                console.error('Failed to get display properties:', error)
                return {}
            }
        }


        async getPropertyTypes() {
            const columns = await this.dataSpace.column.list({ table_name: this.name })
            return columns.map((col: any) => ({ name: col.table_column_name, type: col.type }))
        }

        async changePropertyType(propertyName: string, newType: FieldType) {
            const field = await this.dataSpace.column.getColumn(
                this.name,
                propertyName
            )

            if (!field) return
            await this.dataSpace.exec2(
                `UPDATE ${ColumnTableName} SET type = ? WHERE table_column_name = ? AND table_name = ?;`,
                [newType, propertyName, this.name]
            )
            // const oldColumnType = ColumnTable.getColumnTypeByFieldType(field.type)
            // const newColumnType = ColumnTable.getColumnTypeByFieldType(newType)
            // const isColumnTypeChanged = oldColumnType !== newColumnType
            // if (isColumnTypeChanged) {
            //     const sql = alterColumnType(this.name, propertyName, newColumnType)
            //     await this.dataSpace.db.exec(sql)
            // }
        }

        /**
         * Get count of documents where the specified property is not empty
         * Used to confirm impact scope before deleting a property
         * @param propertyName the property name to check
         * @returns count of documents with non-empty values for this property
         */
        async getPropertyNonEmptyCount(propertyName: string): Promise<number> {
            try {
                // Check if the property column exists
                const columns = await this.getTableColumns()
                if (!columns.includes(propertyName)) {
                    return 0
                }

                // Query count of non-empty values
                // For different field types, "empty" has different meanings:
                // - Text fields: not NULL and not empty string
                // - Number fields: not NULL
                // - Boolean fields: not NULL
                // - JSON fields: not NULL and not empty JSON

                const columnInfo = await this.dataSpace.column.getColumn(this.name, propertyName)
                let whereCondition: string

                if (!columnInfo) {
                    return 0
                }

                switch (columnInfo.type) {
                    case FieldType.Number:
                    case FieldType.Rating:
                    case FieldType.Checkbox:
                        // For numeric and boolean types, just check not NULL
                        whereCondition = `${propertyName} IS NOT NULL`
                        break
                    default:
                        // For text and other types, check not NULL and not empty string
                        whereCondition = `${propertyName} IS NOT NULL AND ${propertyName} != ''`
                        break
                }

                const sql = `SELECT COUNT(*) as count FROM ${this.name} WHERE ${whereCondition}`
                const res = await this.dataSpace.exec2(sql)

                return res[0]?.count || 0
            } catch (error) {
                console.error('Failed to get property non-empty count:', error)
                return 0
            }
        }

        async deleteProperty(propertyName: string) {
            try {
                await this.dataSpace.db.prepare('BEGIN TRANSACTION;').run()
                this.deleteTrigger()
                this.dataSpace.db.prepare(`DELETE FROM ${ColumnTableName} WHERE table_column_name = ? AND table_name = ?;`).run([propertyName, this.name])
                this.dataSpace.db.prepare(`ALTER TABLE ${this.name} DROP COLUMN ${propertyName};`).run()
                await this.dataSpace.db.prepare('COMMIT;').run()
                this.flushTrigger()
            } catch (error) {
                await this.dataSpace.db.prepare('ROLLBACK;').run()
                console.error('Error in deleteField transaction:', error)
                this.dataSpace.notify({
                    title: "Error",
                    description:
                        `Failed to delete column, ${error}`,
                })
            }
        }
    };
}
