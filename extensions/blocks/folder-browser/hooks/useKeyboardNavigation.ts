import { useState, useEffect, useRef, useCallback } from "react"
import type { FileEntry } from "../types"

interface UseKeyboardNavigationOptions {
  entries: FileEntry[]
  searchInputRef: React.RefObject<HTMLInputElement | null>
  onOpen: (entry: FileEntry) => void
}

export function useKeyboardNavigation({
  entries,
  searchInputRef,
  onOpen,
}: UseKeyboardNavigationOptions) {
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Search shortcut: Ctrl+F
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      // Only handle navigation when search is not focused
      if (document.activeElement === searchInputRef.current) {
        // Handle navigation in search input
        if (e.key === "ArrowDown") {
          e.preventDefault()
          searchInputRef.current?.blur()
          if (entries.length > 0) {
            setSelectedEntry(entries[0].path)
          }
        }
        return
      }

      if (!entries.length) return

      const currentIndex = selectedEntry
        ? entries.findIndex((entry) => entry.path === selectedEntry)
        : -1

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          const nextIndex =
            currentIndex < entries.length - 1 ? currentIndex + 1 : 0
          setSelectedEntry(entries[nextIndex].path)
          break
        case "ArrowUp":
          e.preventDefault()
          const prevIndex =
            currentIndex > 0 ? currentIndex - 1 : entries.length - 1
          setSelectedEntry(entries[prevIndex].path)
          break
        case "Enter":
          if (selectedEntry) {
            const entry = entries.find((e) => e.path === selectedEntry)
            if (entry) onOpen(entry)
          }
          break
        case "/":
          e.preventDefault()
          searchInputRef.current?.focus()
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [entries, selectedEntry, searchInputRef, onOpen])

  return {
    selectedEntry,
    setSelectedEntry,
  }
}
