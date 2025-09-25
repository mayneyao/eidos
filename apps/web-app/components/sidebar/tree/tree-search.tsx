import { useCallback, useEffect, useRef, useState } from "react"
import { SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { useTreeSidebarStore } from "./tree-sidebar-store"

export const TreeSearch = () => {
  const { searchTerm, setSearchTerm, showSearch, toggleSearch, setShowSearch } = useTreeSidebarStore()
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm)
  const inputRef = useRef<HTMLInputElement>(null)

  const DEBOUNCE_DELAY = 200

  const debouncedSearch = useCallback(
    (() => {
      let timeoutId: NodeJS.Timeout
      return (term: string) => {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => {
          setSearchTerm(term)
        }, DEBOUNCE_DELAY)
      }
    })(),
    [setSearchTerm]
  )

  const handleSearchChange = (term: string) => {
    setLocalSearchTerm(term)
    debouncedSearch(term)
  }

  useEffect(() => {
    setLocalSearchTerm(searchTerm)
  }, [searchTerm])

  // Handle focus when search becomes visible
  useEffect(() => {
    if (showSearch && inputRef.current) {
      // Wait for the CSS animation to complete before focusing
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 350) // Slightly longer than the CSS transition duration (300ms)
      
      return () => clearTimeout(timer)
    }
  }, [showSearch])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      setLocalSearchTerm("")
      setSearchTerm("")
      setShowSearch(false)
    }
  }

  const handleToggleSearch = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('Search button clicked, current showSearch:', showSearch)
    toggleSearch()
  }, [toggleSearch, showSearch])

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
            ref={inputRef}
            placeholder="Search nodes..."
            value={localSearchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-6 text-xs w-full"
          />
        </div>
      </div>

      {/* Search Toggle */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 relative z-10"
        onClick={handleToggleSearch}
        type="button"
      >
        <SearchIcon className="h-4 w-4" />
      </Button>
    </div>
  )
}
