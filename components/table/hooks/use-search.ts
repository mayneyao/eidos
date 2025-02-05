import { useSqlite } from "@/hooks/use-sqlite"
import { useThrottleFn } from "ahooks"
import { useContext, useEffect } from "react"
import { TableContext } from "../hooks"


export const useSearch = (viewId: string) => {
    const { sqlite } = useSqlite()
    const {
        searchQuery,
        setSearchQuery,
        showSearch,
        currentSearchIndex,
        setCurrentSearchIndex,
        setShowSearch,
        tableName,
        setSearchResults,
        setSearchTime
    } = useContext(TableContext)

    const { run: throttledSearch } = useThrottleFn(
        async (query: string) => {
            if (!sqlite || !tableName || !query || !viewId) {
                setSearchResults(null)
                setSearchTime(0)
                setCurrentSearchIndex(0)
                return
            }
            try {
                const { results, searchTime } = await sqlite.searchTableFTS(tableName, query, viewId)
                setSearchResults(results)
                setSearchTime(searchTime)
                setCurrentSearchIndex(0)
            } catch (error) {
                console.error('Search error:', error)
                setSearchResults(null)
                setSearchTime(0)
                setCurrentSearchIndex(0)
            }
        },
        { wait: 300 }
    )

    useEffect(() => {
        throttledSearch(searchQuery)
    }, [searchQuery])

    return {
        searchQuery,
        setSearchQuery,
        showSearch,
        setShowSearch
    }
}
