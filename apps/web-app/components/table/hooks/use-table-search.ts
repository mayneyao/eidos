import { useReadonlySqlite } from "@/apps/web-app/hooks/use-readonly-sqlite"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useThrottleFn } from "ahooks"
import { useCallback, useContext, useEffect, useRef, useState } from "react"
import { TableContext, useView } from "../hooks"
import { useTableSearchStore } from "../table-store-provider"

const MIN_SEARCH_LENGTH = 2
const PAGE_SIZE = 100

/**
 * Check if table is a dataview (vw_ prefix) or regular table (tb_ prefix)
 */
const isDataView = (tableName: string): boolean => {
  return tableName.startsWith("vw_")
}

export const useTableSearch = (viewId: string) => {
  const readonlySqlite = useReadonlySqlite()
  const { sqlite } = useSqlite()
  const { tableName } = useContext(TableContext)
  const currentView = useView(viewId)
  const {
    searchQuery,
    setSearchQuery,
    showSearch,
    setShowSearch,
    setSearchResults,
    searchResults,
    initializeSearchResults,
    currentSearchIndex,
    totalMatches,
    setTotalMatches,
    setSearchTime,
    currentPage,
    setCurrentPage,
    clearSearchResults,
    clearSearch,
  } = useTableSearchStore()

  const resetSearch = () => {
    clearSearch()
  }

  useEffect(() => {
    if (currentView?.query) {
      resetSearch()
    }
  }, [currentView?.query])

  useEffect(() => {
    if (!showSearch) {
      resetSearch()
    }
  }, [showSearch])

  useEffect(() => {
    resetSearch()
  }, [tableName])

  const searchAbortController = useRef<AbortController | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [needsFTSSetup, setNeedsFTSSetup] = useState(false)
  // For dataview: no searchable fields configured
  const [noSearchableFields, setNoSearchableFields] = useState(false)

  const setupFTS = useCallback(async () => {
    if (!sqlite || !tableName) return false

    // DataView doesn't need FTS setup
    if (isDataView(tableName)) {
      return true
    }

    try {
      await sqlite.createTableFTS(tableName)
      setNeedsFTSSetup(false)
      // Retry search after setup
      if (searchQuery.length >= MIN_SEARCH_LENGTH) {
        performSearch(searchQuery, 1)
      }
      return true
    } catch (error) {
      console.error("Failed to create FTS table:", error)
      return false
    }
  }, [sqlite, tableName, searchQuery])

  const checkFTS = useCallback(async () => {
    if (!sqlite || !tableName) return false

    // DataView doesn't use FTS
    if (isDataView(tableName)) {
      setNeedsFTSSetup(false)
      return true
    }

    const hasFTS = await sqlite.hasTableFTS(tableName)
    setNeedsFTSSetup(!hasFTS)
    return hasFTS
  }, [sqlite, tableName])

  const performSearch = async (query: string, page: number = 1) => {
    if (
      !sqlite ||
      !readonlySqlite ||
      !tableName ||
      !query ||
      !viewId ||
      query.length < MIN_SEARCH_LENGTH
    ) {
      setSearchResults([], 0)
      setSearchTime(0)
      return
    }

    // Check if it's a dataview
    const isView = isDataView(tableName)

    if (!isView) {
      // Regular table: check FTS
      const hasFTS = await sqlite.hasTableFTS(tableName)
      if (!hasFTS) {
        setNeedsFTSSetup(true)
        return
      }
    }

    const page2Index = (page - 1) * PAGE_SIZE
    const page2Data = searchResults[page2Index]
    if (page2Data) {
      return
    }

    const maxPage = Math.ceil(totalMatches / PAGE_SIZE)
    if (page > maxPage && totalMatches > 0) {
      return
    }

    if (searchAbortController.current) {
      searchAbortController.current.abort()
    }
    searchAbortController.current = new AbortController()

    try {
      setIsSearching(true)
      setNoSearchableFields(false)

      let result

      if (isView) {
        // DataView search using LIKE
        result = await readonlySqlite.dataView.search(
          tableName,
          query,
          page,
          PAGE_SIZE
        )

        // Check if no searchable fields configured
        if (result.totalMatches === 0 && result.searchTime === -1) {
          setNoSearchableFields(true)
        }
      } else {
        // Regular table FTS search
        result = await readonlySqlite.searchTableFTS(
          tableName,
          query,
          viewId,
          page,
          PAGE_SIZE
        )
      }

      console.log("search", query, page, result)

      const newOffset = (page - 1) * PAGE_SIZE
      if (page === 1) {
        initializeSearchResults(result.totalMatches)
      }

      setSearchResults(result.results, newOffset)

      setSearchTime(result.searchTime)
      setTotalMatches(result.totalMatches)
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return
      }
      console.error("Search error:", error)
      setSearchResults([], 0)
      setSearchTime(0)
    } finally {
      setIsSearching(false)
    }
  }

  const { run: throttledSearch } = useThrottleFn(
    (query: string) => performSearch(query, 1),
    {
      wait: 500,
    }
  )

  useEffect(() => {
    // Reset only search results before performing new search
    clearSearchResults()
    // only search 1st page when query is changed
    throttledSearch(searchQuery)
  }, [searchQuery])

  useEffect(() => {
    if (!searchQuery || totalMatches === 0) return

    const maxPage = Math.ceil(totalMatches / PAGE_SIZE)
    const targetPage = Math.floor(currentSearchIndex / PAGE_SIZE) + 1

    if (targetPage !== currentPage && targetPage <= maxPage) {
      performSearch(searchQuery, targetPage)
      setCurrentPage(targetPage)
    }
  }, [currentSearchIndex, currentPage, totalMatches, searchQuery])

  // Reset noSearchableFields when table changes
  useEffect(() => {
    setNoSearchableFields(false)
  }, [tableName])

  return {
    searchQuery,
    setSearchQuery,
    showSearch,
    setShowSearch,
    isSearching,
    needsFTSSetup,
    setupFTS,
    checkFTS,
    noSearchableFields,
    isDataView: isDataView(tableName || ""),
  }
}
