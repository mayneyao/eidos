import { useCallback, useEffect, useRef, useState } from "react"
import { useDebounceFn, useKeyPress } from "ahooks"
import { useNavigate } from "react-router-dom"

import { Input } from "@/components/ui/input"
import { useQueryNode } from "@/apps/web-app/hooks/use-query-node"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"

import { useTreeSidebarStore } from "./tree-sidebar-store"

export const TreeSearch = () => {
  const { 
    searchTerm, 
    setSearchTerm, 
    setSearchResults, 
    setIsSearchMode,
    searchResults,
    selectedIndex,
    setSelectedIndex,
    isNodesExpanded,
    isContentExpanded,
  } = useTreeSidebarStore()
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm)
  const inputRef = useRef<HTMLInputElement>(null)
  const { queryNodes, fullTextSearch } = useQueryNode()
  const { space } = useCurrentPathInfo()
  const navigate = useNavigate()
  
  // Calculate visible nodes for keyboard navigation
  const nodeMatches = searchResults.filter((node) => node.mode === "node")
  const ftsResults = searchResults.filter((node) => node.mode === "fts")
  const visibleNodes = [
    ...(isNodesExpanded ? nodeMatches : []),
    ...(isContentExpanded ? ftsResults : [])
  ]

  // Reset selectedIndex if it's out of bounds when visibility changes
  useEffect(() => {
    if (selectedIndex >= visibleNodes.length && visibleNodes.length > 0) {
      setSelectedIndex(visibleNodes.length - 1)
    }
  }, [visibleNodes.length, selectedIndex, setSelectedIndex])

  const performSearch = async (term: string) => {
    if (!space) return
    
    if (term.length === 0) {
      setSearchResults([])
      setIsSearchMode(false)
      return
    }

    // Enable search mode when there's a search term
    setIsSearchMode(true)

    // Perform both node name search and full-text search
    const nodes = await queryNodes(term)
    const ftsNodes = await fullTextSearch(term)
    
    // Combine results, FTS results first, then node name matches
    const combinedResults = [...(ftsNodes || []), ...(nodes || [])]
    setSearchResults(combinedResults)
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

    // Handle navigation keys only when there are visible nodes
    if (visibleNodes.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex(Math.min(selectedIndex + 1, visibleNodes.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex(Math.max(selectedIndex - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const selectedNode = visibleNodes[selectedIndex]
      if (selectedNode) {
        const id = selectedNode.id
        if (id.length === 10) {
          navigate(`/journals/${id}`)
        } else {
          navigate(`/${id}`)
        }
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
        placeholder="Search nodes..."
        value={localSearchTerm}
        onChange={(e) => handleSearchChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-7 text-sm w-full"
      />
    </div>
  )
}
