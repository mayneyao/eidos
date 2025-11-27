"use client"

import { useCallback, useEffect } from "react"
import { FileTextIcon, FolderIcon, ToyBrickIcon } from "lucide-react"
import { useNavigate } from "react-router-dom"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { ExtNodeBadge } from "@/components/ext-node-badge"
import { useDebounce } from "@/apps/web-app/hooks/use-debounce"
import {
  useGlobalSearch,
  type SearchResult,
} from "@/apps/web-app/hooks/use-global-search"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

export function GlobalSearch() {
  const { isGlobalSearchOpen, setGlobalSearchOpen } = useAppRuntimeStore()
  const { sqlite } = useSqlite()
  const navigate = useNavigate()

  const {
    searchTerm,
    setSearchTerm,
    nodeResults,
    extensionResults,
    fileResults,
    isLoading,
  } = useGlobalSearch(sqlite, isGlobalSearchOpen)

  // Separate file results if we want to show them separately,
  // currently they are mixed in nodeResults because we reused "node" type in performSearch
  // Let's identify them by checking if they are NOT in the initial allNodes list?
  // Or better, let's change performSearch to use a distinct type or property if we want a separate group.
  // For now, let's keep them in Nodes group as they are files.
  // But wait, "Nodes" usually means database nodes.
  // If we want to show "Files" group, we should change the type in performSearch.

  // Let's update performSearch to use a specific marker if we want to group them.
  // However, the current UI groups by "node" and "extension".
  // If I add a new type "file", I need to update the rendering logic.

  // Let's stick to "node" type for now as they are files in the system.
  // But maybe we can distinguish them by path?

  // Actually, let's create a separate group for "Files" to be clear.
  // I will update performSearch to use type "file" (casted to any or update interface)
  // But SearchResult interface defines type as "node" | "extension".
  // I should update SearchResult interface first if I want a new type.

  // For this iteration, I will treat them as "node" type so they appear in "Nodes" group.
  // This is consistent with "everything is a node" philosophy?
  // But mounted files are not nodes in the DB.

  // Let's see... The user requirement says "Return matching internal nodes/extensions AND mount directory files".
  // "Nodes" group might be confusing if they are external files.

  // I'll update SearchResult interface to include "file" type.

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
      } else if (result.type === "file") {
        // For files, we might want to open them or navigate to a file viewer
        // Currently we don't have a generic file viewer route?
        // Maybe we can navigate to the folder?
        // Or if it's a supported file type, open it.

        // For now, let's assume we can navigate to the file path if it's supported
        // But wait, navigate() expects a route.
        // If it's a mounted file, we might need a specific route.
        // E.g. /files/view?path=...

        // Looking at the codebase, is there a file viewer?
        // The user requirement says "Click the result to open the file".

        // Let's check how nodes are opened. navigate(`/${result.id}`)
        // If I use the path as ID?

        // If I navigate to `/${result.path}`, it might try to load it as a node ID.

        // Let's assume for now we just log it or do nothing until we know how to open files.
        // Or maybe we can use the same route if the router supports paths?

        // Actually, looking at `apps/docs/src/content/docs/zh-cn/concepts/file.mdx`,
        // it mentions /@/mountName/filename.

        // If I navigate to `/${result.path}`, e.g. `/@/music/song.mp3`,
        // does the router handle it?

        // Let's try navigating to the path.
        navigate(`/file-handler#${result.path}`)
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

  // Highlight matching keywords in text
  const highlightText = useCallback((text: string, query: string) => {
    if (!query.trim()) return text

    const keywords = query.split(/\s+/).filter((k) => k.length > 0)
    let result = text

    // Create a regex that matches any of the keywords (case-insensitive)
    const pattern = keywords
      .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")
    const regex = new RegExp(`(${pattern})`, "gi")

    const parts = result.split(regex)

    return (
      <>
        {parts.map((part, i) => {
          const isMatch = keywords.some(
            (k) => k.toLowerCase() === part.toLowerCase()
          )
          return isMatch ? (
            <mark
              key={i}
              className="bg-yellow-200 dark:bg-yellow-800 font-semibold"
            >
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        })}
      </>
    )
  }, [])

  // Extract directory path from full path (VSCode style)
  const getDirectoryPath = useCallback((fullPath: string) => {
    const parts = fullPath.split("/")
    parts.pop() // Remove filename
    return parts.join("/") || "/"
  }, [])

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
            placeholder="Search nodes, extensions and files..."
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
                {searchTerm &&
                  nodeResults.length === 0 &&
                  extensionResults.length === 0 &&
                  fileResults.length === 0 && (
                    <CommandEmpty>
                      <span>No results found for &quot;{searchTerm}&quot;</span>
                    </CommandEmpty>
                  )}

                {nodeResults.length > 0 &&
                  (() => {
                    // Check for duplicate values and add index if needed
                    const valueMap = new Map<string, number>()
                    const processedResults = nodeResults
                      .slice(0, 50)
                      .map((result, index) => {
                        const baseValue = `${result.name} - ${result.path}`
                        const count = valueMap.get(baseValue) || 0
                        valueMap.set(baseValue, count + 1)

                        // Only add index if this value appears multiple times
                        const finalValue =
                          count > 0 ? `${baseValue} #${count}` : baseValue

                        return { ...result, displayValue: finalValue }
                      })

                    return (
                      <CommandGroup heading={`Nodes (${nodeResults.length})`}>
                        {processedResults.map((result) => (
                          <CommandItem
                            key={result.id}
                            value={result.displayValue}
                            onSelect={() => handleSelect(result)}
                          >
                            {getNodeIcon(result)}
                            <div className="flex items-center justify-between flex-1 min-w-0 gap-2">
                              <span className="truncate">
                                {highlightText(
                                  result.name || "Untitled",
                                  searchTerm
                                )}
                              </span>
                              <div className="flex items-center gap-2 shrink-0">
                                {result.nodeType?.startsWith("ext__") && (
                                  <ExtNodeBadge type={result.nodeType} />
                                )}
                                <span className="text-xs text-muted-foreground truncate">
                                  {highlightText(
                                    getDirectoryPath(result.path),
                                    searchTerm
                                  )}
                                </span>
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                        {nodeResults.length > 50 && (
                          <div className="px-2 py-1 text-xs text-muted-foreground">
                            +{nodeResults.length - 50} more results
                          </div>
                        )}
                      </CommandGroup>
                    )
                  })()}

                {extensionResults.length > 0 && (
                  <CommandGroup
                    heading={`Extensions (${extensionResults.length})`}
                  >
                    {extensionResults.slice(0, 50).map((result) => (
                      <CommandItem
                        key={result.id}
                        value={`${result.name} - ${result.path}`}
                        onSelect={() => handleSelect(result)}
                      >
                        {getNodeIcon(result)}
                        <span className="truncate">
                          {highlightText(result.name || "Untitled", searchTerm)}
                        </span>
                      </CommandItem>
                    ))}
                    {extensionResults.length > 50 && (
                      <div className="px-2 py-1 text-xs text-muted-foreground">
                        +{extensionResults.length - 50} more results
                      </div>
                    )}
                  </CommandGroup>
                )}

                {fileResults.length > 0 && (
                  <CommandGroup heading={`Files (${fileResults.length})`}>
                    {fileResults.slice(0, 50).map((result) => (
                      <CommandItem
                        key={result.path}
                        value={`${result.name} - ${result.path}`}
                        onSelect={() => handleSelect(result)}
                      >
                        <FileTextIcon className="mr-2 h-4 w-4" />
                        <div className="flex items-center justify-between flex-1 min-w-0 gap-2">
                          <span className="truncate">
                            {highlightText(
                              result.name || "Untitled",
                              searchTerm
                            )}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground truncate">
                              {highlightText(
                                getDirectoryPath(result.path),
                                searchTerm
                              )}
                            </span>
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                    {fileResults.length > 50 && (
                      <div className="px-2 py-1 text-xs text-muted-foreground">
                        +{fileResults.length - 50} more results
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
