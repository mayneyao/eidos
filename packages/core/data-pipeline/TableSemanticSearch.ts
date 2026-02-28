import { getTableIdByRawTableName } from "@/lib/utils"
import type { DataSpace } from "../data-space"
import { TableManager } from "../sdk/table"
import { FieldType } from "../fields/const"

export class TableSemanticSearch {
  constructor(private readonly dataspace: DataSpace) {}

  // turn into object params
  async search(params: {
    tableName: string
    query: string
    viewId?: string
    fieldId?: string
    page?: number
    pageSize?: number
    method?: "L2" | "COSINE"
  }) {
    const {
      tableName,
      query,
      viewId,
      fieldId,
      page = 1,
      pageSize = 20,
      method = "L2",
    } = params
    const embedding = this.dataspace.context.embedding
    if (!embedding) {
      throw new Error("Embedding function is not set")
    }

    const tm = new TableManager(
      getTableIdByRawTableName(tableName),
      this.dataspace
    )

    const fields = await tm.fields.all()

    const embeddingFields = fields
      .filter((field) => field.type === FieldType.Text)
      .filter((field) => field.property?.enableEmbedding)

    if (embeddingFields.length > 1 && !fieldId) {
      console.warn(
        `Multiple embedding fields found (${embeddingFields.map((f) => f.table_column_name).join(", ")}). Using the first one ('${embeddingFields[0].table_column_name}') by default. Specify 'fieldId' for a different field.`
      )
    }

    const _fieldId = fieldId || embeddingFields[0]?.table_column_name
    if (!_fieldId) {
      throw new Error("No embedding field found")
    }
    const embeddingResult = await embedding(query)

    if (!embeddingResult || embeddingResult.length === 0) {
      throw new Error("Failed to generate embedding for the query")
    }

    const vectorColumnName = `${_fieldId}__vec`
    // Ensure vector column exists (optional check, depends on desired robustness)
    // const columns = await table.columns();
    // if (!columns.find(col => col.name === vectorColumnName)) {
    //     throw new Error(`Vector column ${vectorColumnName} not found in table ${tableName}`);
    // }

    // Format the embedding vector for SQL query (assuming it's an array of numbers)
    const embeddingVectorString = JSON.stringify(embeddingResult)
    const offset = (page - 1) * pageSize

    // const rawTableColumns = await this.dataspace.exec2('pragma table_info(' + tableName + ')') as any[]
    // // exclude columns that name ends with __vec
    // const columns = rawTableColumns.filter((column) => !column.name.endsWith('__vec'))
    const columnNames = fields
      .map((column) => column.table_column_name)
      .join(",")
    const distanceFunction =
      method === "L2" ? "vec_distance_L2" : "vec_distance_cosine"
    const sql = `
SELECT
    _id,
    ${columnNames},
    ${distanceFunction}("${vectorColumnName}", ?) AS _distance
FROM "${tm.rawTableName}"
WHERE "${vectorColumnName}" IS NOT NULL AND ("${_fieldId}" IS NOT NULL AND "${_fieldId}" != '')
ORDER BY _distance
LIMIT ${pageSize} OFFSET ${offset};`

    try {
      const result = await this.dataspace.exec2(sql, [embeddingVectorString])
      // TODO: Potentially map results to a specific format or view (using viewId?)
      return {
        meta: {
          embeddingFieldId: _fieldId,
          page,
          pageSize,
        },
        results: result,
      }
    } catch (error) {
      console.error("Error executing semantic search query:", error)
      throw new Error(
        `Failed to execute semantic search on table ${tableName}, field ${_fieldId}`
      )
    }
  }
}
