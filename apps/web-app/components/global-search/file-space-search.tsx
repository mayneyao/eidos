import { useCallback, useEffect, useRef, useState } from "react"
import type { FileSpaceSearchResult } from "@eidos.space/file-space"
import { File, FileCode2, FileImage, FileText, Search } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  filePathFromSpaceUrl,
  toSpaceFileUrl,
} from "@/apps/web-app/components/file-space/file-path"
import { navigateAfterFlushingSpaceFile } from "@/apps/web-app/components/file-space/file-navigation"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import {
  useSpaceFileChanges,
  useSpaceFiles,
} from "@/apps/web-app/hooks/use-space-files"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Dialog, DialogContent } from "@/components/ui/dialog"

const CODE_EXTENSIONS = new Set([
  "css",
  "html",
  "js",
  "json",
  "jsx",
  "py",
  "sh",
  "sql",
  "ts",
  "tsx",
  "xml",
  "yaml",
  "yml",
])
const IMAGE_EXTENSIONS = new Set([
  "avif",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
])

function extensionOf(filePath: string): string {
  return filePath.split(".").pop()?.toLowerCase() ?? ""
}

function resultIcon(filePath: string) {
  const extension = extensionOf(filePath)
  if (extension === "md" || extension === "markdown") return FileText
  if (IMAGE_EXTENSIONS.has(extension)) return FileImage
  if (CODE_EXTENSIONS.has(extension)) return FileCode2
  return File
}

function parentPath(filePath: string): string {
  const parts = filePath.split("/")
  parts.pop()
  return parts.join("/") || "Space root"
}

function matchLabel(result: FileSpaceSearchResult): string {
  if (result.match === "alias") return "Alias"
  if (result.match === "content") {
    return result.line ? "Content · line " + result.line : "Content"
  }
  if (result.match === "mixed") return "Path and content"
  if (result.match === "name") return "File name"
  return "Path"
}

export function FileSpaceSearch() {
  const { currentSpace } = useCurrentSpace()
  const { search } = useSpaceFiles(currentSpace?.id)
  const { location, navigate } = useRouterAdapter()
  const { isGlobalSearchOpen, setGlobalSearchOpen } = useAppRuntimeStore()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<FileSpaceSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const searchVersion = useRef(0)

  useSpaceFileChanges(
    currentSpace?.id,
    useCallback(() => {
      if (isGlobalSearchOpen) setRevision((value) => value + 1)
    }, [isGlobalSearchOpen])
  )

  useEffect(() => {
    if (!isGlobalSearchOpen || !currentSpace?.id) return
    const version = ++searchVersion.current
    const timeout = window.setTimeout(
      () => {
        setIsLoading(true)
        void search(query, { limit: 80 })
          .then((nextResults) => {
            if (version !== searchVersion.current) return
            setResults(nextResults)
            setError(null)
          })
          .catch((searchError) => {
            if (version !== searchVersion.current) return
            setResults([])
            setError(
              searchError instanceof Error
                ? searchError.message
                : "Unable to search this Space"
            )
          })
          .finally(() => {
            if (version === searchVersion.current) setIsLoading(false)
          })
      },
      query ? 160 : 0
    )
    return () => {
      window.clearTimeout(timeout)
    }
  }, [currentSpace?.id, isGlobalSearchOpen, query, revision, search])

  useEffect(() => {
    if (isGlobalSearchOpen) return
    searchVersion.current += 1
    setQuery("")
    setResults([])
    setError(null)
    setIsLoading(false)
  }, [isGlobalSearchOpen])

  const openResult = useCallback(
    async (result: FileSpaceSearchResult) => {
      const currentFilePath = filePathFromSpaceUrl(
        location.pathname + location.search + location.hash
      )
      const navigated = await navigateAfterFlushingSpaceFile({
        spaceId: currentSpace?.id,
        currentFilePath,
        destination: toSpaceFileUrl(result.path),
        navigate,
        options: { target: "_blank" },
      })
      if (!navigated) {
        setError(
          "Eidos could not save the current file before opening this result."
        )
        return
      }
      setGlobalSearchOpen(false)
    },
    [
      currentSpace?.id,
      location.hash,
      location.pathname,
      location.search,
      navigate,
      setGlobalSearchOpen,
    ]
  )

  return (
    <Dialog open={isGlobalSearchOpen} onOpenChange={setGlobalSearchOpen}>
      <DialogContent
        className={cn(
          "fixed left-1/2 top-16 z-50 w-full max-w-2xl -translate-x-1/2 translate-y-0 gap-0 overflow-hidden border bg-background p-0 shadow-lg",
          "origin-top duration-200 ease-out",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
          "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
          "sm:rounded-lg"
        )}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search files in this Space…"
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList className="max-h-[min(60vh,32rem)]">
            {isLoading && results.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Search className="h-4 w-4 animate-pulse" />
                {query ? "Searching…" : "Indexing Space…"}
              </div>
            ) : error ? (
              <CommandEmpty>{error}</CommandEmpty>
            ) : results.length === 0 ? (
              <CommandEmpty>
                {query
                  ? "No files found for “" + query + "”"
                  : "This Space is empty"}
              </CommandEmpty>
            ) : (
              <CommandGroup heading={query ? "Files" : "Recent files"}>
                {results.map((result) => {
                  const Icon = resultIcon(result.path)
                  return (
                    <CommandItem
                      key={result.path}
                      value={result.path}
                      className="items-start py-2.5"
                      onSelect={() => void openResult(result)}
                    >
                      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-baseline gap-2">
                          <span className="truncate font-medium">
                            {result.name}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {query ? matchLabel(result) : null}
                          </span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {result.snippet || parentPath(result.path)}
                        </div>
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
