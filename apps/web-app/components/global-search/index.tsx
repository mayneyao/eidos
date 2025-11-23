"use client"

import type { IDirectoryEntry } from "@/packages/core/types/IExternalFileSystem"
import { FileTextIcon, FolderIcon, ToyBrickIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { ExtNodeBadge } from "@/components/ext-node-badge"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Dialog, DialogContent } from "@/components/ui/dialog"

interface SearchResult {
  type: "node" | "extension"
  id: string
  name: string
  path: string
  isDirectory?: boolean
  nodeType?: string
}

export function GlobalSearch() {
  const { isGlobalSearchOpen, setGlobalSearchOpen } = useAppRuntimeStore()
  const [searchTerm, setSearchTerm] = useState("")
  const [allNodes, setAllNodes] = useState<IDirectoryEntry[]>([])
  const [allExtensions, setAllExtensions] = useState<IDirectoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { sqlite } = useSqlite()
  const navigate = useNavigate()

  // Fetch all nodes and extensions when dialog opens
  useEffect(() => {
    if (!isGlobalSearchOpen || !sqlite?.fs) return

    const loadEntries = async () => {
      setIsLoading(true)
      try {
        const fs = sqlite.fs

        // Load nodes recursively
        console.time("readdir nodes")
        const nodesEntries = await fs.readdir("~/.eidos/__NODES__/", {
          withFileTypes: true,
          recursive: true,
        })
        console.timeEnd("readdir nodes")
        setAllNodes(nodesEntries)

        // Load extensions
        const extensionsEntries = await fs.readdir("~/.eidos/__EXTENSIONS__/", {
          withFileTypes: true,
        })
        setAllExtensions(extensionsEntries)
      } catch (error) {
        console.error("Failed to load entries:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadEntries()
  }, [isGlobalSearchOpen, sqlite])

  // Helper function to convert directory entry to search result
  const entryToSearchResult = useCallback(
    (
      entry: IDirectoryEntry,
      type: "node" | "extension"
    ): SearchResult | null => {
      try {
        if (
          !entry.name ||
          !entry.path ||
          typeof entry.name !== "string" ||
          typeof entry.path !== "string"
        ) {
          console.warn(`Invalid ${type} entry:`, entry)
          return null
        }

        const parts = entry.path.split("/").filter(Boolean)
        const id = parts[parts.length - 1]

        if (!id) {
          console.warn(`Could not extract ${type} ID from path:`, entry.path)
          return null
        }

        const displayPath = entry.metadata?.namePath || entry.path

        return {
          type,
          id,
          name: entry.name || "Untitled",
          path: displayPath,
          isDirectory: type === "node" ? entry.kind === "directory" : undefined,
          nodeType: entry.metadata?.nodeType,
        }
      } catch (error) {
        console.error(`Error processing ${type} entry:`, entry, error)
        return null
      }
    },
    []
  )

  // Filter results based on search term
  const searchResults = useMemo(() => {
    const results: SearchResult[] = []

    // If no search term, show first 10 nodes and first 10 extensions
    if (!searchTerm) {
      // Add first 10 nodes
      allNodes.slice(0, 10).forEach((entry) => {
        const result = entryToSearchResult(entry, "node")
        if (result) results.push(result)
      })

      // Add first 10 extensions
      allExtensions.slice(0, 10).forEach((entry) => {
        const result = entryToSearchResult(entry, "extension")
        if (result) results.push(result)
      })

      return results
    }

    // Filter nodes based on search term
    const term = searchTerm.toLowerCase()
    allNodes.forEach((entry) => {
      const result = entryToSearchResult(entry, "node")
      if (result) {
        const nameMatch = result.name.toLowerCase().includes(term)
        const namePathMatch =
          entry.metadata?.namePath?.toLowerCase().includes(term) || false
        const idPathMatch = entry.path.toLowerCase().includes(term)

        if (nameMatch || namePathMatch || idPathMatch) {
          results.push(result)
        }
      }
    })

    // Filter extensions based on search term
    allExtensions.forEach((entry) => {
      const result = entryToSearchResult(entry, "extension")
      if (result && result.name.toLowerCase().includes(term)) {
        results.push(result)
      }
    })

    return results
  }, [searchTerm, allNodes, allExtensions, entryToSearchResult])

  // Group results by type
  const nodeResults = useMemo(
    () => searchResults.filter((r) => r.type === "node"),
    [searchResults]
  )
  const extensionResults = useMemo(
    () => searchResults.filter((r) => r.type === "extension"),
    [searchResults]
  )

  const handleSelect = useCallback(
    (result: SearchResult) => {
      if (result.type === "node") {
        // Check if it's a journal (10 character date format)
        if (result.id.length === 10) {
          navigate(`/journals/${result.id}`)
        } else {
          navigate(`/${result.id}`)
        }
      } else if (result.type === "extension") {
        navigate(`/extensions/${result.id}`)
      }
      setGlobalSearchOpen(false)
      setSearchTerm("")
    },
    [navigate, setGlobalSearchOpen]
  )

  // Reset search term when dialog closes
  useEffect(() => {
    if (!isGlobalSearchOpen) {
      setSearchTerm("")
    }
  }, [isGlobalSearchOpen])

  const getNodeIcon = (result: SearchResult) => {
    if (result.type === "node") {
      return result.isDirectory ? (
        <FolderIcon className="mr-2 h-4 w-4" />
      ) : (
        <FileTextIcon className="mr-2 h-4 w-4" />
      )
    }
    return <ToyBrickIcon className="mr-2 h-4 w-4" />
  }

  return (
    <Dialog open={isGlobalSearchOpen} onOpenChange={setGlobalSearchOpen}>
      <DialogContent className="fixed left-[50%] top-16 z-50 w-full max-w-2xl translate-x-[-50%] translate-y-0 gap-0 border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[-10%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[-10%] sm:rounded-lg overflow-hidden p-0">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          <CommandInput
            placeholder="Search nodes and extensions..."
            value={searchTerm}
            onValueChange={setSearchTerm}
            autoFocus
          />
          <CommandList>
            {isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Loading...
              </div>
            ) : (
              <>
                {searchTerm && searchResults.length === 0 && (
                  <CommandEmpty>
                    <span>No results found for &quot;{searchTerm}&quot;</span>
                  </CommandEmpty>
                )}

                {nodeResults.length > 0 && (
                  <CommandGroup heading={`Nodes (${nodeResults.length})`}>
                    {nodeResults.slice(0, 10).map((result) => (
                      <CommandItem
                        key={result.path}
                        value={`${result.name} - ${result.path}`}
                        onSelect={() => handleSelect(result)}
                      >
                        {getNodeIcon(result)}
                        <div className="flex items-center justify-between flex-1 min-w-0 gap-2">
                          <span className="truncate">
                            {result.name || "Untitled"}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {result.nodeType?.startsWith("ext__") && (
                              <ExtNodeBadge type={result.nodeType} />
                            )}
                            <span className="text-xs text-muted-foreground truncate">
                              {result.path}
                            </span>
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {extensionResults.length > 0 && (
                  <CommandGroup
                    heading={`Extensions (${extensionResults.length})`}
                  >
                    {extensionResults.slice(0, 10).map((result) => (
                      <CommandItem
                        key={result.path}
                        value={`${result.name} - ${result.path}`}
                        onSelect={() => handleSelect(result)}
                      >
                        {getNodeIcon(result)}
                        <span className="truncate">
                          {result.name || "Untitled"}
                        </span>
                      </CommandItem>
                    ))}
                    {extensionResults.length > 10 && (
                      <div className="px-2 py-1 text-xs text-muted-foreground">
                        +{extensionResults.length - 10} more results
                      </div>
                    )}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
