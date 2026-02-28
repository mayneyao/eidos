import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useEmbedding } from "./use-embedding"

export const useTableEmbeddingQuery = () => {
  const { sqlite } = useSqlite()

  const { embeddingTexts } = useEmbedding()

  const queryEmbedding = async (
    tableId: string,
    fieldId: string,
    query: string,
    limit = 10
  ) => {
    if (!sqlite) {
      return
    }
    const queryVector = (await embeddingTexts([query])) || []
    const result = await sqlite?.queryEmbedding(
      tableId,
      fieldId,
      JSON.stringify(queryVector[0]),
      limit
    )
    return result
  }

  return {
    queryEmbedding,
  }
}
