"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { useFinder, type UseFinderOptions } from "./hooks/useFinder"
import { FinderSidebar } from "./FinderSidebar"
import { FinderToolbar } from "./FinderToolbar"
import { FinderContent } from "./FinderContent"
import { FinderGallery } from "./FinderGallery"

interface FinderDialogProps extends UseFinderOptions {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  confirmLabel?: string
  className?: string
  /**
   * Container element to render the dialog into.
   * When provided, the dialog will be rendered as a child of this element
   * instead of the body, helping with click-outside detection.
   */
  container?: HTMLElement
}

export function FinderDialog({
  open,
  onOpenChange,
  title = "Select File",
  confirmLabel = "Select",
  className,
  initialPath = "~/",
  selectMode = "file",
  allowMultiple = false,
  accept,
  onSelect,
  container,
}: FinderDialogProps) {
  // Use refs to keep stable references
  const onSelectRef = useRef(onSelect)
  const onOpenChangeRef = useRef(onOpenChange)

  onSelectRef.current = onSelect
  onOpenChangeRef.current = onOpenChange

  // View mode state
  const [viewMode, setViewMode] = useState<"list" | "gallery">("list")

  const {
    currentPath,
    locations,
    items,
    isLoading,
    isSearching,
    selectedPaths,
    searchQuery,
    canGoBack,
    canGoForward,
    isSearchMode,
    searchScope,
    navigateTo,
    navigateBack,
    navigateForward,
    toggleSelection,
    handleItemDoubleClick,
    setSearchQuery,
    setSearchScope,
    confirmSelection,
    selectAll,
  } = useFinder({
    initialPath,
    selectMode,
    allowMultiple,
    accept,
    onSelect,
  })

  const contentRef = useRef<HTMLDivElement>(null)

  // Handle confirm
  const handleConfirm = useCallback(() => {
    confirmSelection()
    onOpenChangeRef.current(false)
  }, [confirmSelection])

  // Handle cancel
  const handleCancel = useCallback(() => {
    onOpenChangeRef.current(false)
  }, [])

  // Prevent closing when clicking outside (overlay or content area)
  const handlePointerDownOutside = useCallback((e: Event) => {
    e.preventDefault()
  }, [])

  // Keyboard shortcuts - stable handler
  useEffect(() => {
    if (!open) return

    // Check if an input element is currently focused
    const isInputFocused = () => {
      const activeElement = document.activeElement
      if (!activeElement) return false
      const tagName = activeElement.tagName.toLowerCase()
      const isInputElement =
        tagName === "input" ||
        tagName === "textarea" ||
        (activeElement as HTMLElement).isContentEditable
      return isInputElement
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip global shortcuts when input is focused (except Escape)
      if (isInputFocused() && e.key !== "Escape") {
        return
      }

      if (e.key === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        onOpenChangeRef.current(false)
        return
      }

      if (e.key === "Enter" && !e.shiftKey) {
        // Check if any item is selected via DOM
        const hasSelection = document.querySelector('[aria-selected="true"]')
        if (hasSelection) {
          e.preventDefault()
          onOpenChangeRef.current(false)
        }
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault()
        selectAll()
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "[") {
        e.preventDefault()
        navigateBack()
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "]") {
        e.preventDefault()
        navigateForward()
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, selectAll, navigateBack, navigateForward])

  // Focus content when opened
  useEffect(() => {
    if (open && contentRef.current) {
      const timer = setTimeout(() => {
        contentRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        className={cn(
          "max-w-4xl h-[600px] p-0 gap-0 overflow-hidden click-outside-ignore",
          "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
          "border border-border/50 shadow-2xl",
          className
        )}
        container={container}
        onPointerDownOutside={handlePointerDownOutside}
      >
        <DialogHeader className="px-4 py-3 border-b border-border bg-background/95">
          <DialogTitle className="text-base font-semibold tracking-tight">
            {title}
          </DialogTitle>
        </DialogHeader>

        <div
          ref={contentRef}
          className="flex-1 flex min-h-0 outline-hidden h-[calc(600px-57px-57px)]"
          tabIndex={-1}
        >
          <FinderSidebar
            locations={locations}
            currentPath={currentPath}
            onNavigate={navigateTo}
            isLoading={isLoading && !items.length}
          />

          <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
            <FinderToolbar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              isSearching={isSearching}
              path={currentPath}
              locations={locations}
              onNavigate={navigateTo}
              canSearch={selectMode === "file"}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              searchScope={searchScope}
              onSearchScopeChange={setSearchScope}
              isSearchMode={isSearchMode}
            />

            <div className="flex-1 min-h-0 overflow-hidden">
              {viewMode === "list" ? (
                <FinderContent
                  items={items}
                  selectedPaths={selectedPaths}
                  currentPath={currentPath}
                  isLoading={isLoading}
                  isSearchMode={isSearchMode}
                  selectMode={selectMode}
                  accept={accept}
                  onSelect={toggleSelection}
                  onDoubleClick={handleItemDoubleClick}
                />
              ) : (
                <FinderGallery
                  items={items}
                  selectedPaths={selectedPaths}
                  selectMode={selectMode}
                  accept={accept}
                  onSelect={toggleSelection}
                  onDoubleClick={handleItemDoubleClick}
                />
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-4 py-3 border-t border-border bg-muted/20 gap-2">
          <div className="flex-1 flex items-center gap-3 text-sm text-muted-foreground">
            {isLoading ? (
              // Loading state
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/50 border-t-muted-foreground" />
                <span>Loading...</span>
              </div>
            ) : selectMode === "file" ? (
              // File mode: show selected count
              selectedPaths.size > 0 ? (
                <span className="font-medium">
                  {selectedPaths.size} file
                  {selectedPaths.size > 1 ? "s" : ""} selected
                </span>
              ) : (
                <span>
                  {items.filter((i) => i.kind !== "directory").length} file
                  {items.filter((i) => i.kind !== "directory").length !== 1
                    ? "s"
                    : ""}
                </span>
              )
            ) : (
              // Directory mode: show current path
              <span
                className="font-medium truncate max-w-[300px]"
                title={currentPath}
              >
                {currentPath}
              </span>
            )}
          </div>
          <Button
            variant="outline"
            onClick={handleCancel}
            className="min-w-[80px]"
          >
            Cancel
          </Button>
          {selectMode === "directory" ? (
            // Directory mode: always allow selecting current folder
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  onSelectRef.current?.([currentPath])
                  onOpenChangeRef.current(false)
                }}
                className="min-w-[120px]"
              >
                Select This Folder
              </Button>
              {selectedPaths.size > 0 && (
                <Button onClick={handleConfirm} className="min-w-[80px]">
                  {confirmLabel}
                </Button>
              )}
            </>
          ) : (
            // File mode: require selection
            <Button
              onClick={handleConfirm}
              disabled={selectedPaths.size === 0}
              className="min-w-[80px]"
            >
              {confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
