import { useCallback, useEffect, useRef, useState } from "react"
import { useKeyPress } from "ahooks"

import { Input } from "@/components/ui/input"
import { useAllExtensions } from "@/apps/web-app/hooks/use-all-extensions"

export const ExtensionSearch = () => {
  const { searchTerm, updateSearch } = useAllExtensions()
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm)
  const inputRef = useRef<HTMLInputElement>(null)

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
      updateSearch("")
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
        placeholder="Search extensions..."
        value={localSearchTerm}
        onChange={(e) => handleSearchChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-7 text-sm w-full"
      />
    </div>
  )
}

