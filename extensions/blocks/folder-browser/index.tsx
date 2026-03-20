import { useState, useRef, useCallback } from "react"
import type { FolderHandlerContext } from "@eidos.space/react"
import { useEidos, useExtensionContext } from "@eidos.space/react"

import { Breadcrumb } from "./components/Breadcrumb"
import { SearchInput } from "./components/SearchInput"
import { FileList } from "./components/FileList"
import { StatusBar } from "./components/StatusBar"
import { LoadingState } from "./components/LoadingState"
import { ErrorState } from "./components/ErrorState"
import { ContextMenu } from "./components/ContextMenu"
import { useFolderEntries } from "./hooks/useFolderEntries"
import { useKeyboardNavigation } from "./hooks/useKeyboardNavigation"
import type { FileEntry } from "./types"

/**
 * Extension metadata for Eidos
 * FolderHandler type - Modern file browser with refined UI
 */
export const meta = {
  type: "folderHandler",
  componentName: "FolderBrowser",
  icon: "folder",
  folderHandler: {
    title: "Finder",
    description:
      "Modern file browser with clean list view, breadcrumb navigation, and refined visual design.",
    patterns: ["*"],
    priority: 0,
    allowRoot: true,
  },
}

export function FolderBrowser() {
  const ctx = useExtensionContext<FolderHandlerContext>()
  const { folderPath } = ctx

  const eidos = useEidos()
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    entry: FileEntry | null
  } | null>(null)

  const {
    entries,
    filteredEntries,
    searchQuery,
    setSearchQuery,
    sortField,
    sortOrder,
    handleSort,
    loading,
    error,
    loadEntries,
    stats,
  } = useFolderEntries(folderPath, eidos.currentSpace)

  const handleOpen = useCallback(
    (entry: FileEntry) => {
      if (entry.kind === "directory") {
        const encodedPath = encodeURIComponent(entry.path)
        eidos.currentSpace.navigate(`/folder#${encodedPath}`)
      } else {
        // Open file with file-handler - the system will automatically select appropriate handler
        const encodedPath = encodeURIComponent(entry.path)
        eidos.currentSpace.navigate(`/file-handler#${encodedPath}`)
      }
    },
    [eidos.currentSpace]
  )

  const handleOpenInNewTab = useCallback(
    (entry: FileEntry) => {
      if (entry.kind === "file") {
        // Open in new tab using navigate API
        const encodedPath = encodeURIComponent(entry.path)
        eidos.currentSpace.navigate(`/file-handler#${encodedPath}`, {
          target: "_blank",
        })
      }
    },
    [eidos.currentSpace]
  )

  const { selectedEntry, setSelectedEntry } = useKeyboardNavigation({
    entries: filteredEntries,
    searchInputRef,
    onOpen: handleOpen,
  })

  const navigateToSegment = useCallback(
    (path: string) => {
      const encodedPath = encodeURIComponent(path)
      eidos.currentSpace.navigate(`/folder#${encodedPath}`)
    },
    [eidos.currentSpace]
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, entry: FileEntry) => {
      e.preventDefault()
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        entry,
      })
    },
    []
  )

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  if (loading && entries.length === 0) {
    return <LoadingState />
  }

  if (error) {
    return <ErrorState error={error} onRetry={loadEntries} />
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b">
        {/* Breadcrumb */}
        <div className="flex-1 min-w-0">
          <Breadcrumb folderPath={folderPath} onNavigate={navigateToSegment} />
        </div>

        {/* Search */}
        <SearchInput
          ref={searchInputRef}
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery("")}
        />
      </div>

      {/* File List with integrated column headers and virtual scroll */}
      <FileList
        entries={filteredEntries}
        searchQuery={searchQuery}
        selectedEntry={selectedEntry}
        sortField={sortField}
        sortOrder={sortOrder}
        onSelect={setSelectedEntry}
        onOpen={handleOpen}
        onContextMenu={handleContextMenu}
        onSort={handleSort}
      />

      {/* Status Bar */}
      <StatusBar
        stats={stats}
        totalEntries={entries.length}
        filteredCount={filteredEntries.length}
        searchQuery={searchQuery}
      />

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entry={contextMenu.entry}
          onClose={closeContextMenu}
          onOpen={handleOpen}
          onOpenInNewTab={handleOpenInNewTab}
        />
      )}
    </div>
  )
}
