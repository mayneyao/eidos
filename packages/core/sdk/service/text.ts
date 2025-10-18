import type { DataSpace } from "../../data-space"
import type { TableManager } from "../table"
import type { IField } from "../../types/IField"
import type { TextProperty } from "../../fields/text"


export interface IVecMeta {
    updateAt: number
    outOfDate: boolean
}

export class TextFieldService {
    dataSpace: DataSpace
    constructor(private table: TableManager) {
        this.dataSpace = this.table.dataSpace
    }


    queryEmbedding = async (fieldId: string, query: string, limit = 10) => {
        const vectorColumnName = `${fieldId}__vec`
        const sql = `
select
  _id,
  ${fieldId},
  ${vectorColumnName},
  vec_distance_L2(${vectorColumnName}, '${query}') as distance
from ${this.table.rawTableName} where ${vectorColumnName} is not null
order by distance limit ${limit};`

        const result = await this.dataSpace.exec2(sql)
        return result
    }

    updateEmbedding = async (fieldId: string, data: { recordId: string, value: string }[]) => {
        const vectorColumnName = `${fieldId}__vec`
        const vectorMetaColumnName = `${fieldId}__vec_meta`

        const stmt = this.dataSpace.db.prepare(`
            update ${this.table.rawTableName} 
            set 
                ${vectorColumnName} = vec_f32(?),
                ${vectorMetaColumnName} = json_object(
                    'updateAt', cast(strftime('%s', 'now') as integer), 
                    'outOfDate', false
                )
            where _id = ?
        `)
        for (const item of data) {
            try {
                stmt.run([item.value, item.recordId])
            } catch (error) {
                console.error('Error updating embedding:', error)
                console.log('Data:', {
                    recordId: item.recordId,
                })
                throw error
            }
        }
    }

    resetEmbedding = async (fieldId: string) => {
        const vectorColumnName = `${fieldId}__vec`
        const vectorMetaColumnName = `${fieldId}__vec_meta`

        // Clear the vector data in the table
        const sql = `
            UPDATE ${this.table.rawTableName}
            SET 
                ${vectorColumnName} = NULL,
                ${vectorMetaColumnName} = NULL
        `
        await this.dataSpace.exec(sql)

        // Clear the model property from the field definition
        const currentField = await this.dataSpace.column.getColumn(this.table.rawTableName, fieldId);
        if (currentField && currentField.property?.model) {
            const updatedProperty = { ...currentField.property, model: null };
            await this.dataSpace.column.updateProperty({
                tableName: this.table.rawTableName,
                tableColumnName: fieldId,
                property: updatedProperty,
                type: currentField.type
            });
        }
    }

    // ... existing code ...
    onPropertyChange = async (oldField: IField<TextProperty>, property: TextProperty) => {
        const { table_column_name, table_name } = oldField
        const vectorColumnName = `${table_column_name}__vec`
        const vectorMetaColumnName = `${table_column_name}__vec_meta`
        const isEnableEmbedding = property.enableEmbedding && !oldField.property?.enableEmbedding

        if (!isEnableEmbedding) {
            return
        }

        // Check if vector columns exist
        const checkColumnsSql = `
        SELECT name FROM pragma_table_info('${table_name}') 
        WHERE name IN ('${vectorColumnName}', '${vectorMetaColumnName}')
    `
        const existingColumns = await this.dataSpace.exec2(checkColumnsSql)
        const existingColumnNames = existingColumns.map((col: any) => col.name)

        // Create vector column if it doesn't exist
        if (!existingColumnNames.includes(vectorColumnName)) {
            await this.dataSpace.exec(`
            ALTER TABLE ${table_name} 
            ADD COLUMN ${vectorColumnName} BLOB
        `)
        }

        // Create vector meta column if it doesn't exist
        if (!existingColumnNames.includes(vectorMetaColumnName)) {
            await this.dataSpace.exec(`
            ALTER TABLE ${table_name} 
            ADD COLUMN ${vectorMetaColumnName} TEXT
        `)
        }

        // Create or replace trigger for updating vec_meta
        const triggerName = `${table_name}_${table_column_name}_update_trigger`
        this.dataSpace.db.exec(`DROP TRIGGER IF EXISTS ${triggerName};`)
        this.dataSpace.db.prepare(`
            CREATE TRIGGER ${triggerName}
            AFTER UPDATE OF ${table_column_name} ON ${table_name}
            BEGIN
                UPDATE ${table_name}
                SET 
                    ${vectorColumnName} = CASE 
                        WHEN NEW.${table_column_name} IS NULL THEN NULL 
                        ELSE ${vectorColumnName}
                    END,
                    ${vectorMetaColumnName} = CASE
                        WHEN NEW.${table_column_name} IS NULL THEN NULL
                        ELSE json_object(
                            'updateAt', cast(strftime('%s', 'now') as integer),
                            'outOfDate', true
                        )
                    END
                WHERE _id = NEW._id;
            END;
        `).run()
    }

    /**
 * when user delete a link field, we also need to delete the paired link field and delete relation data
 */
    async beforeDeleteColumn(
        tableName: string,
        columnName: string,
        db = this.dataSpace.db
    ) {
        const field = await this.dataSpace.column.getColumn(tableName, columnName)
        if (!field) return
        const vectorColumnName = `${columnName}__vec`
        const vectorMetaColumnName = `${columnName}__vec_meta`

        try {
            // Drop the vector and vector meta columns
            db.exec(`ALTER TABLE ${tableName} DROP COLUMN ${vectorColumnName}`);
            db.exec(`ALTER TABLE ${tableName} DROP COLUMN ${vectorMetaColumnName}`);
        } catch (error: any) {
            // Ignore errors if columns don't exist
            console.log(`Some columns might not exist while trying to drop them: ${error.message}`);
        }

        // Drop the trigger if it exists
        const triggerName = `${tableName}_${columnName}_update_trigger`
        db.exec(`DROP TRIGGER IF EXISTS ${triggerName};`)
    }

    /**
     * Get statistics about the embedding status for a text field
     * @param fieldId The field ID to get statistics for
     * @returns Statistics about vectorization status
     */
    async getEmbeddingStats(fieldId: string): Promise<{
        total: number
        vectorized: number
        outdated: number
        upToDate: number
        vectorizedPercentage: number
        outdatedPercentage: number
        upToDatePercentage: number
    }> {
        const vectorColumnName = `${fieldId}__vec`
        const vectorMetaColumnName = `${fieldId}__vec_meta`

        const sql = `
        WITH stats AS (
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN ${vectorColumnName} IS NOT NULL THEN 1 ELSE 0 END) as vectorized,
                SUM(CASE 
                    WHEN ${fieldId} IS NOT NULL -- Ensure original text exists
                    AND ${vectorColumnName} IS NOT NULL -- Ensure vector exists
                    AND json_extract(${vectorMetaColumnName}, '$.outOfDate') = 1 -- Check outdated flag
                    THEN 1 ELSE 0 END) as outdated,
                SUM(CASE 
                    WHEN ${vectorColumnName} IS NOT NULL 
                    AND ${fieldId} IS NOT NULL
                    AND json_extract(${vectorMetaColumnName}, '$.outOfDate') = 0 
                    THEN 1 ELSE 0 END) as upToDate
            FROM ${this.table.rawTableName}
            WHERE ${fieldId} IS NOT NULL
        )
        SELECT 
            total,
            vectorized,
            outdated,
            upToDate,
            ROUND(CAST(vectorized AS FLOAT) / CAST(total AS FLOAT) * 100, 2) as vectorizedPercentage,
            ROUND(CAST(outdated AS FLOAT) / CAST(vectorized AS FLOAT) * 100, 2) as outdatedPercentage,
            ROUND(CAST(upToDate AS FLOAT) / CAST(vectorized AS FLOAT) * 100, 2) as upToDatePercentage
        FROM stats;`

        const result = await this.dataSpace.exec2(sql)
        return result[0]
    }
}
