import { useCallback, useEffect, useRef } from "react"
import type { IView } from "@/packages/core/types/IView"
import { useKeyPress } from "ahooks"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CornerDownLeft,
  OptionIcon,
  SearchIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn, getTableIdByRawTableName, shortenId } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCurrentSubPage } from "@/apps/web-app/hooks/use-current-sub-page"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"

import { useTableContext } from "./hooks"
import { useTableSearch } from "./hooks/use-table-search"
import type { SemanticSearchResultData } from "./hooks/use-table-search-store"
import { useTableSemanticSearch } from "./hooks/use-table-semantic-search"
import { SemanticSearchResultsList } from "./semantic-search-results-list"
import { useTableSearchStore } from "./table-store-provider"

const Spinner = () => (
  <svg
    className="animate-spin h-4 w-4 text-muted-foreground"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    ></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    ></path>
  </svg>
)

export const ViewSearch = (props: { view: IView }) => {
  const { t } = useTranslation()
  const {
    searchQuery,
    setSearchQuery,
    showSearch,
    setShowSearch,
    searchResults,
    currentSearchIndex,
    searchTime,
    totalMatches,
    isLoadingMore,
    isSemanticSearchActive,
    isSemanticSearching,
    semanticSearchResult,
    setIsSemanticSearchActive,
    setIsSemanticSearching,
    setSemanticSearchResult,
    semanticSearchSelectedIndex,
    setSemanticSearchSelectedIndex,
    clearSearch,
  } = useTableSearchStore()

  const { isSearching } = useTableSearch(props.view?.id)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const resultsListRef = useRef<HTMLUListElement>(null)
  const { search: semanticSearch } = useTableSemanticSearch()

  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus()
    }
  }, [showSearch])

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node) &&
        searchQuery === ""
      ) {
        setShowSearch(false)
        setIsSemanticSearchActive(false)
      }
    },
    [searchQuery, setShowSearch, setIsSemanticSearchActive]
  )

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [handleClickOutside])

  useKeyPress("esc", () => {
    if (showSearch) {
      clearSearch()
    }
  })

  const navigateSearch = useCallback(
    (direction: "next" | "prev") => {
      if (searchResults?.length) {
        const navigateEvent = new CustomEvent("navigateSearch", {
          detail: {
            direction,
            currentIndex: currentSearchIndex,
            total: searchResults.length,
          },
        })
        window.dispatchEvent(navigateEvent)
      }
    },
    [currentSearchIndex, searchResults?.length]
  )

  useKeyPress(["enter"], (event) => {
    if (showSearch && searchResults?.length) {
      const direction: "next" | "prev" = event.shiftKey ? "prev" : "next"
      navigateSearch(direction)
    }
  })

  const handleSemanticSearch = useCallback(async () => {
    if (!searchQuery) return
    console.log("Triggering semantic search for:", searchQuery)
    setIsSemanticSearchActive(true)
    setIsSemanticSearching(true)
    setSemanticSearchSelectedIndex(-1)
    const result = await semanticSearch({
      query: searchQuery,
    })
    setSemanticSearchResult(result)
    setIsSemanticSearching(false)
  }, [
    searchQuery,
    setIsSemanticSearchActive,
    setIsSemanticSearching,
    setSemanticSearchResult,
  ])

  const { space, tableName } = useTableContext()
  const { getOrCreateTableSubDoc } = useSqlite(space)
  const { setSubPage } = useCurrentSubPage()

  // Convert rawTableName to tableId
  const tableId = getTableIdByRawTableName(tableName)

  const handleSemanticSearchResultClick = useCallback(
    async (result: SemanticSearchResultData) => {
      setIsSemanticSearchActive(false)
      const shortId = shortenId(result._id)
      await getOrCreateTableSubDoc({
        docId: shortId,
        title: result.title,
        tableId: tableId!,
      })
      setSubPage(shortId)
    },
    [setIsSemanticSearchActive, setSearchQuery]
  )

  useKeyPress("alt.enter", (event) => {
    event.preventDefault()
    handleSemanticSearch()
  })

  return (
    <div className="relative flex items-center">
      <div
        className={cn(
          "absolute right-0 z-10 flex items-center gap-1",
          "transition-all duration-200 ease-in-out",
          showSearch ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
        )}
      >
        <div
          className={cn(
            "flex h-8 items-center bg-background px-1",
            "overflow-hidden transition-all duration-200 ease-in-out",
            showSearch ? "w-96" : "w-0"
          )}
        >
          <Input
            ref={searchInputRef}
            type="text"
            placeholder={`${t("common.search")} (alt/opt + ↩︎ for semantic)`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-6 w-96 border-0 pl-8 pr-24"
          />
          <SearchIcon className="absolute left-2 h-4 w-4 text-muted-foreground" />

          {isSemanticSearchActive && (
            <div className="absolute top-full left-0 right-0 mt-1 max-h-[400px] w-full overflow-y-auto rounded-md border bg-popover shadow-lg z-20">
              <SemanticSearchResultsList
                isSearching={isSemanticSearching}
                results={semanticSearchResult?.results}
                meta={semanticSearchResult?.meta}
                selectedIndex={semanticSearchSelectedIndex}
                onResultClick={handleSemanticSearchResultClick}
                onResultMouseEnter={setSemanticSearchSelectedIndex}
                listRef={resultsListRef}
              />
            </div>
          )}

          {searchQuery && (
            <div className="absolute right-2 flex items-center gap-1 bg-background">
              {isSearching ? (
                <Spinner />
              ) : searchTime >= 0 ? (
                <>
                  <div className="flex items-center text-xs text-muted-foreground whitespace-nowrap">
                    <span>{currentSearchIndex + 1}</span>
                    <span>/</span>
                    <span>{totalMatches}</span>
                    <span className="ml-2">({searchTime}ms)</span>
                  </div>
                  <div className="flex">
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-6 w-6 p-0 hover:bg-accent"
                      onClick={() => navigateSearch("prev")}
                    >
                      <ChevronUpIcon className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-6 w-6 p-0 hover:bg-accent"
                      onClick={() => navigateSearch("next")}
                    >
                      <ChevronDownIcon className="h-3 w-3" />
                    </Button>
                  </div>
                </>
              ) : (
                !isSemanticSearchActive && (
                  <div className="flex items-center text-xs text-muted-foreground whitespace-nowrap">
                    {`Not found`}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="xs"
        className={cn(
          "transition-opacity duration-200",
          showSearch && "opacity-0"
        )}
        onClick={() => setShowSearch(true)}
      >
        <SearchIcon className="h-4 w-4 opacity-60" />
      </Button>

      {isLoadingMore && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center">
          <span className="text-xs text-muted-foreground">
            Loading more results...
          </span>
        </div>
      )}
    </div>
  )
}
