import { useCallback, useEffect, useState } from "react"
import { SearchIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { useTreeSidebarStore } from "./tree-sidebar-store"

interface TreeSearchProps {
  onExit: () => void
}

export const TreeSearch = ({ onExit }: TreeSearchProps) => {
  const { searchTerm, setSearchTerm } = useTreeSidebarStore()
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm)

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      setLocalSearchTerm("")
      setSearchTerm("")
      onExit()
    }
  }

  return (
    <div className="relative mt-2">
      <SearchIcon className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input
        placeholder="Search nodes..."
        value={localSearchTerm}
        onChange={(e) => handleSearchChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="pl-8 h-8 text-sm"
        autoFocus
      />
    </div>
  )
}
