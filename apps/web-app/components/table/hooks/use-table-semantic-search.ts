import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { TableContext } from "../hooks"
import { useContext } from "react"

export const useTableSemanticSearch = () => {
  const { sqlite } = useSqlite()
  const { tableName } = useContext(TableContext)
  const search = async (params: {
    query: string
    viewId?: string
    page?: number
    pageSize?: number
  }) => {
    if (!sqlite) {
      return {
        meta: {
          page: 1,
          pageSize: 10,
          embeddingFieldId: "",
        },
        results: [],
      }
    }
    const res = await sqlite.semanticSearch({
      tableName,
      query: params.query,
      viewId: params.viewId,
      page: params.page || 1,
      pageSize: params.pageSize || 10,
    })
    return res
  }
  return {
    search,
  }
}
