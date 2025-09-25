import { useCallback, useEffect, useState } from "react"
import { SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAllExtensions } from "@/apps/web-app/hooks/use-all-extensions"

interface ExtensionSearchProps {
  showSearch: boolean
  onToggleSearch: () => void
  onExitSearch: () => void
}

export const ExtensionSearch = ({ showSearch, onToggleSearch, onExitSearch }: ExtensionSearchProps) => {
  const { searchTerm, updateSearch } = useAllExtensions()
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm)

  const DEBOUNCE_DELAY = 200

  const debouncedSearch = useCallback(
    (() => {
      let timeoutId: NodeJS.Timeout
      return (term: string) => {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => {
          updateSearch(term)
        }, DEBOUNCE_DELAY)
      }
    })(),
    [updateSearch]
  )

  const handleSearchChange = (term: string) => {
    setLocalSearchTerm(term)
    debouncedSearch(term)
  }

  useEffect(() => {
    setLocalSearchTerm(searchTerm)
  }, [searchTerm])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      setLocalSearchTerm("")
      updateSearch("")
      onExitSearch()
    }
  }

  return (
    <div className="flex items-center gap-1">
      {/* Search Input with Slide Animation */}
      <div
        className={`h-8 transition-all duration-300 ease-out flex items-center ${
          showSearch ? "w-48 opacity-100" : "w-0 opacity-0"
        }`}
        style={{
          transitionProperty: "width, opacity",
          transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div className="whitespace-nowrap h-full w-full flex items-center px-1">
          <Input
            placeholder="Search extensions..."
            value={localSearchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-6 text-xs w-full"
            autoFocus={showSearch}
          />
        </div>
      </div>

      {/* Search Toggle */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onToggleSearch}
      >
        <SearchIcon className="h-4 w-4" />
      </Button>
    </div>
  )
}
