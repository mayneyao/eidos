import { useCallback, useEffect, useRef, useState } from "react"
import { useDebounceFn, useKeyPress } from "ahooks"
import { useNavigate } from "react-router-dom"

import { Input } from "@/components/ui/input"
import { useQueryExtension } from "@/apps/web-app/hooks/use-query-extension"
import { useExtensionStore } from "@/apps/web-app/store/extension-store"

export const ExtensionSearch = () => {
  const {
    searchTerm,
    setSearchTerm,
    setSearchResults,
    setIsSearchMode,
    searchResults,
    selectedIndex,
    setSelectedIndex,
  } = useExtensionStore()
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm)
  const inputRef = useRef<HTMLInputElement>(null)
  const { fullTextSearchExtensions } = useQueryExtension()
  const navigate = useNavigate()

  // Calculate visible items for keyboard navigation (FTS results only)
  const visibleItems = searchResults

  // Reset selectedIndex if it's out of bounds when visibility changes
  useEffect(() => {
    if (selectedIndex >= visibleItems.length && visibleItems.length > 0) {
      setSelectedIndex(visibleItems.length - 1)
    }
  }, [visibleItems.length, selectedIndex, setSelectedIndex])

  const performSearch = async (term: string) => {
    if (term.length === 0) {
      setSearchResults([])
      setIsSearchMode(false)
      return
    }

    // Enable search mode when there's a search term
    setIsSearchMode(true)

    // Perform only full-text search (content search)
    const ftsExtensions = await fullTextSearchExtensions(term)

    setSearchResults(ftsExtensions || [])
  }

  const { run: debouncedSearch } = useDebounceFn(performSearch, { wait: 300 })

  const handleSearchChange = (term: string) => {
    setLocalSearchTerm(term)
    setSearchTerm(term)
    debouncedSearch(term)
  }

  useEffect(() => {
    setLocalSearchTerm(searchTerm)
  }, [searchTerm])

  // Focus input when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      setLocalSearchTerm("")
      setSearchTerm("")
      setSearchResults([])
      setIsSearchMode(false)
      return
    }

    // Handle navigation keys only when there are visible items
    if (visibleItems.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex(Math.min(selectedIndex + 1, visibleItems.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex(Math.max(selectedIndex - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const selectedItem = visibleItems[selectedIndex]
      if (selectedItem) {
        navigate(`/extensions/${selectedItem.id}`)
      }
    }
  }

  // Keyboard shortcut: Shift + Cmd/Ctrl + F to focus search
  useKeyPress(["shift.ctrl.f", "shift.meta.f"], (e) => {
    e.preventDefault()
    if (inputRef.current) {
      inputRef.current.focus()
    }
  })

  return (
    <div className="flex items-center w-full">
      <Input
        ref={inputRef}
        placeholder="Search content... (⌘P for names)"
        value={localSearchTerm}
        onChange={(e) => handleSearchChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-7 text-sm w-full"
      />
    </div>
  )
}

