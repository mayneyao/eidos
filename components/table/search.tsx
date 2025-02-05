import { useCallback, useContext, useEffect, useRef } from "react"
import { useKeyPress } from "ahooks"
import { ChevronDownIcon, ChevronUpIcon, SearchIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { TableContext } from "./hooks"

export const TableSearch = () => {
  const { t } = useTranslation()
  const {
    searchQuery,
    setSearchQuery,
    showSearch,
    setShowSearch,
    searchResults,
    currentSearchIndex,
    setCurrentSearchIndex,
    searchTime,
  } = useContext(TableContext)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 当显示搜索框时自动聚焦
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
      }
    },
    [searchQuery, setShowSearch]
  )

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [handleClickOutside])

  useKeyPress("esc", () => {
    if (showSearch) {
      setShowSearch(false)
      setSearchQuery("")
    }
  })

  useKeyPress(["ctrl.f", "meta.f"], (event) => {
    event.preventDefault()
    setShowSearch(true)
  })

  useKeyPress(["enter"], (event) => {
    if (showSearch && searchResults?.length) {
      if (event.shiftKey) {
        setCurrentSearchIndex((prev) =>
          prev > 0 ? prev - 1 : searchResults.length - 1
        )
      } else {
        setCurrentSearchIndex((prev) =>
          prev < searchResults.length - 1 ? prev + 1 : 0
        )
      }
    }
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
            "flex h-8 items-center rounded-md border bg-background",
            "overflow-hidden transition-all duration-200 ease-in-out",
            showSearch ? "w-64" : "w-0"
          )}
        >
          <Input
            ref={searchInputRef}
            type="text"
            placeholder={t("common.search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-64 border-0 pl-8"
          />
          <SearchIcon className="absolute left-2 h-4 w-4 text-muted-foreground" />

          {searchResults && searchResults.length > 0 && (
            <div className="absolute right-2 flex items-center gap-1">
              <div className="flex items-center text-xs text-muted-foreground">
                <span>{currentSearchIndex + 1}</span>
                <span>/</span>
                <span>{searchResults.length}</span>
                <span className="ml-2">({searchTime}ms)</span>
              </div>
              <div className="flex">
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-6 w-6 p-0 hover:bg-accent"
                  onClick={() =>
                    setCurrentSearchIndex((prev) =>
                      prev > 0 ? prev - 1 : searchResults.length - 1
                    )
                  }
                >
                  <ChevronUpIcon className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-6 w-6 p-0 hover:bg-accent"
                  onClick={() =>
                    setCurrentSearchIndex((prev) =>
                      prev < searchResults.length - 1 ? prev + 1 : 0
                    )
                  }
                >
                  <ChevronDownIcon className="h-3 w-3" />
                </Button>
              </div>
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
    </div>
  )
}
