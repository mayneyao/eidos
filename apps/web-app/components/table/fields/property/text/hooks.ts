import { useAiConfig } from "@/apps/web-app/hooks/use-ai-config"
import { useEmbedding } from "@/apps/web-app/hooks/use-embedding"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { toast } from "@/apps/web-app/hooks/use-toast"
import type { TextProperty } from "@/packages/core/fields/text"
import { getRawTableNameById } from "@/lib/utils"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"

type ProgressCallback = (progress: {
  processed: number
  total: number
  percentage: number
}) => void

export const usePreview = (
  updateProperty: (property: TextProperty) => void
) => {
  const { sqlite } = useSqlite()
  const { t } = useTranslation()

  const { embeddingTexts } = useEmbedding()
  const { embeddingModel } = useAiConfig()

  const getEmbeddingStats = useCallback(
    async (tableId: string, fieldId: string) => {
      if (!sqlite) {
        return
      }
      console.log("getEmbeddingStats", tableId, fieldId)
      return await sqlite?.getEmbeddingStats(tableId, fieldId)
    },
    [sqlite]
  )

  const resetEmbedding = async (tableId: string, fieldId: string) => {
    if (!sqlite) {
      return
    }
    updateProperty({ model: null })
    return await sqlite?.resetEmbedding(tableId, fieldId)
  }

  const process = async (
    tableId: string,
    viewId: string,
    fieldId: string,
    onProgress?: ProgressCallback
  ) => {
    if (!sqlite || !embeddingModel) {
      if (!embeddingModel) {
        toast({
          title: t("table.propertyEditor.noEmbeddingModel"),
          description: t("table.propertyEditor.noEmbeddingModelHint"),
          variant: "destructive",
        })
      }
      return
    }

    const field = await sqlite.column.getColumn<TextProperty>(
      getRawTableNameById(tableId),
      fieldId
    )
    if (!field) {
      console.error(`Field ${fieldId} not found in table ${tableId}`)
      toast({
        title: "Field definition not found.",
        variant: "destructive",
      })
      return
    }
    const storedModel = field.property?.model

    if (storedModel && embeddingModel && storedModel !== embeddingModel) {
      toast({
        title: t("table.propertyEditor.processModelMismatchError"),
        variant: "destructive",
      })
      return
    }

    if (!storedModel && embeddingModel) {
      try {
        updateProperty({ model: embeddingModel })
        console.log(
          `Stored embedding model '${embeddingModel}' for field ${fieldId}`
        )
      } catch (error) {
        console.error(`Failed to update field property for ${fieldId}:`, error)
        toast({
          title: "Failed to store embedding model information.",
          variant: "destructive",
        })
        return
      }
    }

    const batchSize = 10
    let processed = 0
    let stillProcessing = true

    const vectorMetaColumnName = `${fieldId}__vec_meta`

    const rawQueryBase = `SELECT * FROM tb_${tableId} WHERE ${fieldId} IS NOT NULL AND (${vectorMetaColumnName} IS NULL OR json_extract(${vectorMetaColumnName}, '$.outOfDate') = 1)`

    const countQuery = `SELECT COUNT(*) FROM (${rawQueryBase})`
    const countResult = await sqlite?._table(tableId).rows.query(
      {},
      {
        raw: true,
        rawQuery: countQuery,
      }
    )
    const total = countResult?.[0]?.["COUNT(*)"] || 0
    console.log("Initial total to process:", total)
    if (total === 0) {
      onProgress?.({ processed: 0, total: 0, percentage: 100 })
      return
    }

    onProgress?.({ processed: 0, total, percentage: 0 })

    while (stillProcessing) {
      let batchDataLength = 0
      try {
        const query = `${rawQueryBase} LIMIT ${batchSize}`
        console.log("Querying next batch:", query)

        const rows = await sqlite?._table(tableId).rows.query(
          {},
          {
            raw: true,
            rawQuery: query,
          }
        )

        if (!rows || rows.length === 0) {
          stillProcessing = false
          break
        }

        const texts = rows.map((row) => row[fieldId])
        let batchEmbeddings: (number[] | null)[] | null = null

        if (texts.length > 0) {
          try {
            batchEmbeddings = (await embeddingTexts(texts)) ?? null
          } catch (embeddingError) {
            console.error(
              `Embedding generation failed for a batch. Error:`,
              embeddingError,
              "Rows:",
              rows.map((r) => r._id)
            )
            continue
          }

          if (!batchEmbeddings || batchEmbeddings.length !== texts.length) {
            console.error(
              `Embedding returned incomplete results. Expected ${texts.length}, got ${batchEmbeddings?.length}. Skipping batch.`,
              "Rows:",
              rows.map((r) => r._id)
            )
            continue
          }

          if (batchEmbeddings) {
            const batchData = rows
              .map((row, index) => {
                const embedding = batchEmbeddings?.[index]
                if (!embedding) {
                  console.warn(
                    `Missing embedding for record ${row._id} at index ${index}. Skipping this record.`
                  )
                  return null
                }
                return {
                  recordId: row._id as string,
                  value: JSON.stringify(embedding),
                  dimension: embedding.length,
                }
              })
              .filter(
                (
                  item
                ): item is {
                  recordId: string
                  value: string
                  dimension: number
                } => item !== null
              )

            console.log(`Processing batch of size ${rows.length}`, {
              validEmbeddingsCount: batchData.length,
            })

            if (batchData.length > 0) {
              await sqlite?.updateEmbedding(tableId, fieldId, batchData)
              batchDataLength = batchData.length
              processed += batchDataLength
            } else {
              console.warn(
                `No valid embeddings generated or records to update for this batch.`
              )
            }
          }
        }
      } catch (dbError) {
        console.error(`Error during database update for a batch:`, dbError)
      } finally {
        const percentage =
          total > 0
            ? Math.round((processed / total) * 100)
            : processed > 0
              ? 100
              : 0
        console.log("Progress:", { processed, total, percentage })
        onProgress?.({ processed, total, percentage })
      }
    }

    console.log("Processing finished.")
    onProgress?.({ processed, total, percentage: 100 })
  }

  const queryEmbedding = async (
    tableId: string,
    fieldId: string,
    query: string
  ) => {
    if (!sqlite) {
      return
    }
    const queryVector = (await embeddingTexts([query])) || []
    const result = await sqlite?.queryEmbedding(
      tableId,
      fieldId,
      JSON.stringify(queryVector[0])
    )
    return result
  }
  return {
    process,
    queryEmbedding,
    resetEmbedding,
    getEmbeddingStats,
  }
}
