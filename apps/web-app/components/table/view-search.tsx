import { useCallback, useEffect, useRef } from "react"
import type { IView } from "@/packages/core/types/IView"
import { useKeyPress } from "ahooks"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CornerDownLeft,
  OptionIcon,
  SearchIcon,
  AlertTriangle,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn, getTableIdByRawTableName, shortenId } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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

  const {
    isSearching,
    needsFTSSetup,
    isSettingUpFTS,
    setupFTS,
    checkFTS,
    noSearchableFields,
    isDataView,
  } = useTableSearch(props.view?.id)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const resultsListRef = useRef<HTMLUListElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const { search: semanticSearch } = useTableSemanticSearch()

  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus()
      // Check FTS status when search is shown
      checkFTS()
    }
  }, [showSearch, checkFTS])

  const handleSetupFTS = async () => {
    await setupFTS()
    // Refocus search input after setup
    searchInputRef.current?.focus()
  }

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node) &&
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
    <div ref={searchContainerRef} className="relative flex items-center">
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
            placeholder={
              needsFTSSetup
                ? t("common.search.disabled")
                : noSearchableFields
                  ? t("common.search.noSearchableFields")
                  : `${t("common.search")} ${t("common.search.semantic")}`
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={needsFTSSetup || noSearchableFields}
            className={cn(
              "h-6 w-96 border-0 pl-8 pr-24",
              (needsFTSSetup || noSearchableFields) &&
                "bg-muted text-muted-foreground cursor-not-allowed"
            )}
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

          {needsFTSSetup && (
            <div className="absolute top-full left-0 right-0 mt-1 z-30">
              <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50 py-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <AlertTitle className="text-amber-800 dark:text-amber-200 text-xs font-medium leading-tight">
                      {t("common.search.isDisabled.title")}
                    </AlertTitle>
                    <AlertDescription className="text-amber-700 dark:text-amber-300 text-xs mt-1">
                      <div className="flex flex-col gap-2">
                        <span>{t("common.search.isDisabled.description")}</span>
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={handleSetupFTS}
                          disabled={isSettingUpFTS}
                          className="h-6 text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300 dark:bg-amber-900 dark:hover:bg-amber-800 dark:text-amber-100 dark:border-amber-700 w-fit"
                        >
                          {isSettingUpFTS ? (
                            <>
                              <Spinner />
                              <span className="ml-1">
                                {t("common.search.settingUp")}
                              </span>
                            </>
                          ) : (
                            t("common.search.enable")
                          )}
                        </Button>
                      </div>
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            </div>
          )}

          {noSearchableFields && (
            <div className="absolute top-full left-0 right-0 mt-1 z-30">
              <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50 py-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <AlertTitle className="text-amber-800 dark:text-amber-200 text-xs font-medium leading-tight">
                      {t("common.search.noSearchableFields.title")}
                    </AlertTitle>
                    <AlertDescription className="text-amber-700 dark:text-amber-300 text-xs mt-1">
                      <div className="flex flex-col gap-2">
                        <span>
                          {t("common.search.noSearchableFields.description", {
                            searchComment: "-- @search {field1, field2}",
                          })}
                        </span>
                      </div>
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            </div>
          )}

          {searchQuery && !needsFTSSetup && (
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
                    {t("common.search.notFound")}
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
            {t("common.search.loadingMore")}
          </span>
        </div>
      )}
    </div>
  )
}
